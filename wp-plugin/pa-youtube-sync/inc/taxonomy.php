<?php
if ( ! defined('ABSPATH') ) exit;

/* -------------------------------------------------------
   Register custom taxonomies
------------------------------------------------------- */

add_action( 'init', function () {

    // pa_series — from YouTube playlists (hierarchical)
    register_taxonomy( 'pa_series', [ 'pa_video', 'pa_short', 'pa_podcast', 'post' ], [
        'labels' => [
            'name'              => 'سری‌ها',
            'singular_name'     => 'سری',
            'menu_name'         => 'سری‌ها',
            'all_items'         => 'همه سری‌ها',
            'add_new_item'      => 'افزودن سری جدید',
            'edit_item'         => 'ویرایش سری',
            'update_item'       => 'به‌روزرسانی سری',
            'search_items'      => 'جستجوی سری‌ها',
            'not_found'         => 'سری‌ای یافت نشد',
            'parent_item'       => 'سری والد',
            'parent_item_colon' => 'سری والد:',
        ],
        'hierarchical'      => true,
        'show_ui'           => true,
        'show_in_rest'      => true,
        'show_admin_column' => true,
        'rewrite'           => [ 'slug' => 'series', 'hierarchical' => true ],
        'query_var'         => true,
    ]);

    // pa_topic — thematic topics (flat, like tags)
    register_taxonomy( 'pa_topic', [ 'pa_video', 'pa_short', 'post' ], [
        'labels' => [
            'name'          => 'موضوع‌ها',
            'singular_name' => 'موضوع',
            'menu_name'     => 'موضوع‌ها',
            'all_items'     => 'همه موضوع‌ها',
            'add_new_item'  => 'افزودن موضوع جدید',
            'search_items'  => 'جستجوی موضوع‌ها',
        ],
        'hierarchical'      => false,
        'show_ui'           => true,
        'show_in_rest'      => true,
        'show_admin_column' => true,
        'rewrite'           => [ 'slug' => 'topic' ],
        'query_var'         => true,
    ]);
});

/* -------------------------------------------------------
   Sync YouTube playlist → pa_series term
------------------------------------------------------- */

function pays_sync_playlist_as_series( string $playlist_id, string $playlist_title ): int {
    if ( empty( $playlist_title ) ) $playlist_title = $playlist_id;

    // Look up existing term by playlist ID meta
    $existing = get_terms([
        'taxonomy'   => 'pa_series',
        'hide_empty' => false,
        'meta_query' => [
            [ 'key' => 'pa_playlist_id', 'value' => $playlist_id ],
        ],
    ]);

    if ( ! is_wp_error( $existing ) && ! empty( $existing ) ) {
        return (int) $existing[0]->term_id;
    }

    // Create new term
    $term = wp_insert_term(
        sanitize_text_field( $playlist_title ),
        'pa_series',
        [ 'slug' => sanitize_title( $playlist_title . '-' . substr( $playlist_id, -6 ) ) ]
    );

    if ( is_wp_error( $term ) ) return 0;

    $term_id = (int) ( $term['term_id'] ?? 0 );
    if ( $term_id ) {
        update_term_meta( $term_id, 'pa_playlist_id', $playlist_id );
    }

    return $term_id;
}

/* -------------------------------------------------------
   Assign series to post from its channel playlists
------------------------------------------------------- */

function pays_assign_series_to_post( int $post_id, string $yt_id ): void {
    $api_key = get_option( 'pays_api_key', '' );
    if ( ! $api_key ) return;

    $api       = new PAYS_API( $api_key );
    $ch_id     = (string) get_post_meta( $post_id, 'pa_channel_id', true );
    if ( ! $ch_id ) return;

    $playlists = $api->channel_playlists( $ch_id, 50 );
    if ( empty( $playlists ) ) return;

    foreach ( $playlists as $pl ) {
        $pl_id    = $pl['id'] ?? '';
        $pl_title = $pl['snippet']['title'] ?? '';
        if ( ! $pl_id ) continue;

        // Check if this video is in the playlist (cache in meta for 24h)
        $cache_key = "pays_pl_check_{$pl_id}_{$yt_id}";
        $in_pl     = get_transient( $cache_key );

        if ( $in_pl === false ) {
            $videos = $api->playlist_videos( $pl_id, 50 );
            $ids    = array_column(
                array_column( $videos, 'snippet' ),
                null,
                'resourceId'
            );
            $in_pl = (int) in_array( $yt_id, array_column( $ids, 'videoId' ), true );
            set_transient( $cache_key, $in_pl, DAY_IN_SECONDS );
        }

        if ( $in_pl ) {
            $term_id = pays_sync_playlist_as_series( $pl_id, $pl_title );
            if ( $term_id ) {
                wp_set_post_terms( $post_id, [ $term_id ], 'pa_series', true );
            }
        }
    }
}
