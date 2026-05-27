<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * REST API endpoints for the mini-app
 * Base: /wp-json/pa-yt/v1/
 * Auth: WordPress Application Password (Basic Auth)
 */

add_action('rest_api_init', function() {
    $admin = fn() => current_user_can('manage_options');

    /* Channels */
    register_rest_route('pa-yt/v1', '/channels', [
        ['methods'=>'GET',  'callback'=>'pays_rest_list_channels',  'permission_callback'=>$admin],
        ['methods'=>'POST', 'callback'=>'pays_rest_add_channel',    'permission_callback'=>$admin],
    ]);
    register_rest_route('pa-yt/v1', '/channels/(?P<id>[UC][\w-]+)', [
        ['methods'=>'PATCH',  'callback'=>'pays_rest_update_channel', 'permission_callback'=>$admin],
        ['methods'=>'DELETE', 'callback'=>'pays_rest_delete_channel', 'permission_callback'=>$admin],
    ]);

    /* Queue */
    register_rest_route('pa-yt/v1', '/queue', [
        ['methods'=>'GET', 'callback'=>'pays_rest_list_queue', 'permission_callback'=>$admin],
    ]);
    register_rest_route('pa-yt/v1', '/queue/(?P<id>\d+)/approve', [
        ['methods'=>'POST', 'callback'=>'pays_rest_approve', 'permission_callback'=>$admin],
    ]);
    register_rest_route('pa-yt/v1', '/queue/(?P<id>\d+)/reject', [
        ['methods'=>'POST', 'callback'=>'pays_rest_reject', 'permission_callback'=>$admin],
    ]);

    /* Playlists */
    register_rest_route('pa-yt/v1', '/channels/(?P<id>[UC][\w-]+)/playlists', [
        ['methods'=>'GET', 'callback'=>'pays_rest_playlists', 'permission_callback'=>$admin],
    ]);
    register_rest_route('pa-yt/v1', '/playlists/(?P<pl_id>[\w-]+)/import', [
        ['methods'=>'POST', 'callback'=>'pays_rest_import_playlist', 'permission_callback'=>$admin],
    ]);

    /* Analytics */
    register_rest_route('pa-yt/v1', '/analytics', [
        ['methods'=>'GET', 'callback'=>'pays_rest_analytics', 'permission_callback'=>$admin],
    ]);

    /* Sync */
    register_rest_route('pa-yt/v1', '/sync', [
        ['methods'=>'POST', 'callback'=>'pays_rest_sync', 'permission_callback'=>$admin],
    ]);

    /* Settings */
    register_rest_route('pa-yt/v1', '/settings', [
        ['methods'=>'GET',   'callback'=>'pays_rest_get_settings', 'permission_callback'=>$admin],
        ['methods'=>'PATCH', 'callback'=>'pays_rest_set_settings', 'permission_callback'=>$admin],
    ]);
});

/* â”€â”€ Channels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_list_channels(): WP_REST_Response {
    return new WP_REST_Response(get_option('pays_channels', []), 200);
}

function pays_rest_add_channel( WP_REST_Request $req ): WP_REST_Response {
    $api_key = get_option('pays_api_key', '');
    $input   = sanitize_text_field($req->get_param('channel_input') ?? '');
    if (!$api_key) return new WP_REST_Response(['error'=>'API key not configured'], 400);
    if (!$input)   return new WP_REST_Response(['error'=>'channel_input required'],  400);

    $api   = new PAYS_API($api_key);
    $ch_id = $api->resolve_channel($input);
    if (!$ch_id) return new WP_REST_Response(['error'=>'Channel not found'], 404);

    $channels = get_option('pays_channels', []);
    foreach ($channels as $c) {
        if ($c['id'] === $ch_id) return new WP_REST_Response(['error'=>'Already exists'], 409);
    }

    $info = $api->channel_info($ch_id) ?: ['id'=>$ch_id,'name'=>$ch_id,'thumbnail'=>'','subscribers'=>0,'video_count'=>0];
    $ch   = array_merge($info, [
        'enabled'       => true,
        'import_videos' => true,
        'import_shorts' => true,
        'show_live'     => true,
        'lang'          => (string)($req->get_param('lang') ?: 'fa'),
        'max_videos'    => (int)($req->get_param('max_videos') ?: 20),
    ]);
    $channels[] = $ch;
    update_option('pays_channels', $channels);
    pays_subscribe_channel($ch_id);
    return new WP_REST_Response($ch, 201);
}

function pays_rest_update_channel( WP_REST_Request $req ): WP_REST_Response {
    $ch_id    = $req->get_param('id');
    $channels = get_option('pays_channels', []);
    foreach ($channels as &$c) {
        if ($c['id'] !== $ch_id) continue;
        foreach (['enabled','import_videos','import_shorts','show_live'] as $bool) {
            if (null !== $req->get_param($bool)) $c[$bool] = (bool)$req->get_param($bool);
        }
        if ($req->get_param('lang'))       $c['lang']       = in_array($req->get_param('lang'),['fa','en'],true) ? $req->get_param('lang') : 'fa';
        if ($req->get_param('max_videos')) $c['max_videos'] = max(1,min(50,(int)$req->get_param('max_videos')));
        update_option('pays_channels', $channels);
        return new WP_REST_Response($c, 200);
    }
    return new WP_REST_Response(['error'=>'Not found'], 404);
}

function pays_rest_delete_channel( WP_REST_Request $req ): WP_REST_Response {
    $ch_id    = $req->get_param('id');
    $channels = get_option('pays_channels', []);
    $new      = array_values(array_filter($channels, fn($c) => $c['id'] !== $ch_id));
    if (count($new) === count($channels)) return new WP_REST_Response(['error'=>'Not found'], 404);
    update_option('pays_channels', $new);
    pays_subscribe_channel($ch_id, 'unsubscribe');
    return new WP_REST_Response(null, 204);
}

/* â”€â”€ Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_list_queue( WP_REST_Request $req ): WP_REST_Response {
    global $wpdb;
    $q      = $wpdb->prefix . 'pays_queue';
    $status = sanitize_key($req->get_param('status') ?: 'pending');
    $limit  = min((int)($req->get_param('limit') ?: 50), 100);
    $offset = (int)($req->get_param('offset') ?: 0);

    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM $q WHERE status=%s ORDER BY published_at DESC LIMIT %d OFFSET %d",
        $status, $limit, $offset
    ), ARRAY_A);

    $total = (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $q WHERE status=%s", $status));
    return new WP_REST_Response(['items'=>$rows,'total'=>$total], 200);
}

function pays_rest_approve( WP_REST_Request $req ): WP_REST_Response {
    $id       = (int)$req->get_param('id');
    $override = array_filter([
        'title'       => sanitize_text_field($req->get_param('title')       ?: ''),
        'description' => wp_kses_post(      $req->get_param('description')  ?: ''),
        'lang'        => sanitize_key(      $req->get_param('lang')         ?: ''),
    ]);
    $post_id = PAYS_Importer::approve($id, $override);
    if ($post_id === false) return new WP_REST_Response(['error'=>'Not found or already reviewed'], 404);
    return new WP_REST_Response(['post_id'=>$post_id,'link'=>get_permalink($post_id)], 200);
}

function pays_rest_reject( WP_REST_Request $req ): WP_REST_Response {
    $ok = PAYS_Importer::reject((int)$req->get_param('id'));
    return $ok ? new WP_REST_Response(null, 204) : new WP_REST_Response(['error'=>'Not found'], 404);
}

/* â”€â”€ Playlists â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_playlists( WP_REST_Request $req ): WP_REST_Response {
    $api_key = get_option('pays_api_key', '');
    if (!$api_key) return new WP_REST_Response(['error'=>'No API key'], 400);
    $api = new PAYS_API($api_key);
    $pls = $api->channel_playlists($req->get_param('id'));
    return new WP_REST_Response($pls, 200);
}

function pays_rest_import_playlist( WP_REST_Request $req ): WP_REST_Response {
    $api_key = get_option('pays_api_key', '');
    $pl_id   = $req->get_param('pl_id');
    $ch_id   = sanitize_text_field($req->get_param('channel_id') ?: '');
    $max     = min((int)($req->get_param('max') ?: 50), 50);
    if (!$api_key) return new WP_REST_Response(['error'=>'No API key'], 400);

    $api   = new PAYS_API($api_key);
    $items = $api->playlist_videos($pl_id, $max);
    if (!$items) return new WP_REST_Response(['queued'=>0], 200);

    $ids     = array_filter(array_map(fn($i) => $i['snippet']['resourceId']['videoId'] ?? null, $items));
    $details = $api->video_details(array_values($ids));
    $queued  = 0;
    foreach ($details as $yt_id => $v) {
        $iso = $v['contentDetails']['duration'] ?? 'PT0S';
        if (PAYS_Importer::enqueue($yt_id, $ch_id ?: ($v['snippet']['channelId']??''), $v['snippet'], $iso)) $queued++;
    }
    return new WP_REST_Response(['queued'=>$queued], 200);
}

/* â”€â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_analytics( WP_REST_Request $req ): WP_REST_Response {
    global $wpdb;
    $api_key = get_option('pays_api_key', '');
    $limit   = min((int)($req->get_param('limit') ?: 20), 50);

    // Get recent imported videos with their yt_ids
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT p.ID, p.post_title, pm.meta_value as yt_id
         FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} pm ON pm.post_id=p.ID AND pm.meta_key='pa_youtube_id'
         WHERE p.post_type IN ('pa_video','pa_short') AND p.post_status='publish'
         ORDER BY p.post_date DESC LIMIT %d", $limit
    ), ARRAY_A);

    if (!$rows) return new WP_REST_Response([], 200);

    $yt_stats = [];
    if ($api_key) {
        $api      = new PAYS_API($api_key);
        $yt_stats = $api->video_stats(array_column($rows, 'yt_id'));
    }

    $out = [];
    foreach ($rows as $r) {
        $yt = $yt_stats[$r['yt_id']] ?? [];
        $out[] = [
            'post_id'    => $r['ID'],
            'title'      => $r['post_title'],
            'yt_id'      => $r['yt_id'],
            'yt_views'   => $yt['views']    ?? 0,
            'yt_likes'   => $yt['likes']    ?? 0,
            'yt_comments'=> $yt['comments'] ?? 0,
            'site_views' => (int)get_post_meta($r['ID'], 'post_views_count', true),
            'link'       => get_permalink($r['ID']),
        ];
    }
    return new WP_REST_Response($out, 200);
}

/* â”€â”€ Sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_sync(): WP_REST_Response {
    $results = PAYS_Importer::run_sync();
    return new WP_REST_Response(['results'=>$results,'synced_at'=>current_time('mysql')], 200);
}

/* â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function pays_rest_get_settings(): WP_REST_Response {
    return new WP_REST_Response([
        'api_key'       => get_option('pays_api_key','') ? '***set***' : '',
        'sync_interval' => get_option('pays_sync_interval','hourly'),
        'webhook_url'   => rest_url('pa-yt/v1/webhook'),
        'last_sync'     => get_option('pays_last_sync',''),
        'next_sync'     => wp_next_scheduled('pays_sync_event'),
    ], 200);
}

function pays_rest_set_settings( WP_REST_Request $req ): WP_REST_Response {
    $map = [
        'api_key'        => 'pays_api_key',
        'sync_interval'  => 'pays_sync_interval',
        'pays_ai_enabled'   => 'pays_ai_enabled',
        'pays_ai_provider'  => 'pays_ai_provider',
        'pays_ai_api_key'   => 'pays_ai_api_key',
        'pays_ai_model'     => 'pays_ai_model',
        'pays_ai_lang'      => 'pays_ai_lang',
        'pays_auto_article' => 'pays_auto_article',
    ];
    foreach ( $map as $param => $option ) {
        if ( null !== $req->get_param( $param ) ) {
            update_option( $option, sanitize_text_field( (string) $req->get_param( $param ) ) );
        }
    }
    return pays_rest_get_settings();
}

/* â”€â”€ AI SEO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

add_action( 'rest_api_init', function () {
    $admin = fn() => current_user_can('manage_options');

    // Transcript
    register_rest_route('pa-yt/v1', '/transcript/search', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_transcript_search', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/transcript/(?P<yt_id>[\w-]+)', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_get_transcript', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/transcript/(?P<yt_id>[\w-]+)/fetch', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_fetch_transcript', 'permission_callback' => $admin ],
    ]);

    // AI Content
    register_rest_route('pa-yt/v1', '/ai/(?P<post_id>\d+)', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_get_ai', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/ai/(?P<post_id>\d+)/generate', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_generate_ai', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/ai/(?P<post_id>\d+)/apply', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_apply_ai', 'permission_callback' => $admin ],
    ]);
});

function pays_rest_transcript_search( WP_REST_Request $req ): WP_REST_Response {
    $q = sanitize_text_field( $req->get_param('q') ?? '' );
    if ( ! $q ) return new WP_REST_Response( [], 200 );
    return new WP_REST_Response( PAYS_Transcript::search( $q ), 200 );
}

function pays_rest_get_transcript( WP_REST_Request $req ): WP_REST_Response {
    $yt_id = sanitize_text_field( $req->get_param('yt_id') );
    $lang  = sanitize_key( $req->get_param('lang') ?: 'en' );
    $row   = PAYS_Transcript::get( $yt_id, $lang );
    return $row
        ? new WP_REST_Response( $row, 200 )
        : new WP_REST_Response( [ 'error' => 'No transcript found' ], 404 );
}

function pays_rest_fetch_transcript( WP_REST_Request $req ): WP_REST_Response {
    $yt_id = sanitize_text_field( $req->get_param('yt_id') );
    $lang  = sanitize_key( $req->get_param('lang') ?: 'en' );
    $data  = PAYS_Transcript::fetch( $yt_id, $lang, true );
    return empty( $data['raw_text'] )
        ? new WP_REST_Response( [ 'error' => 'Transcript not available for this video' ], 404 )
        : new WP_REST_Response( $data, 200 );
}

function pays_rest_get_ai( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $lang    = sanitize_key( $req->get_param('lang') ?: 'en' );
    $row     = PAYS_AI_SEO::get( $post_id, $lang );
    return $row
        ? new WP_REST_Response( $row, 200 )
        : new WP_REST_Response( [ 'error' => 'No AI content generated yet' ], 404 );
}

function pays_rest_generate_ai( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $yt_id   = sanitize_text_field( $req->get_param('yt_id') ?: get_post_meta( $post_id, 'pa_youtube_id', true ) );
    $lang    = sanitize_key( $req->get_param('lang') ?: get_option('pays_ai_lang','en') );

    if ( ! $yt_id ) return new WP_REST_Response( [ 'error' => 'yt_id required' ], 400 );

    $result = PAYS_AI_SEO::generate( $post_id, $yt_id, $lang );
    return is_wp_error( $result )
        ? new WP_REST_Response( [ 'error' => $result->get_error_message() ], 500 )
        : new WP_REST_Response( $result, 200 );
}

function pays_rest_apply_ai( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $lang    = sanitize_key( $req->get_param('lang') ?: 'en' );
    $ai      = PAYS_AI_SEO::get( $post_id, $lang );
    if ( ! $ai ) return new WP_REST_Response( [ 'error' => 'No AI content found' ], 404 );
    PAYS_AI_SEO::apply_to_post( $post_id, $ai );
    return new WP_REST_Response( [ 'applied' => true, 'post_id' => $post_id ], 200 );
}

/* â”€â”€ Video-to-Article â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

add_action( 'rest_api_init', function () {
    $admin = fn() => current_user_can('manage_options');

    // Article queue
    register_rest_route('pa-yt/v1', '/article-queue', [
        [ 'methods' => 'GET',  'callback' => 'pays_rest_list_article_queue', 'permission_callback' => $admin ],
        [ 'methods' => 'POST', 'callback' => 'pays_rest_add_article_queue',  'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/article-queue/counts', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_article_queue_counts', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/article-queue/(?P<id>\d+)/retry', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_retry_article', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/article-queue/(?P<id>\d+)', [
        [ 'methods' => 'DELETE', 'callback' => 'pays_rest_delete_article_job', 'permission_callback' => $admin ],
    ]);

    // Article actions
    register_rest_route('pa-yt/v1', '/article/(?P<post_id>\d+)/rewrite', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_rewrite_article', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/article/(?P<post_id>\d+)/links', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_get_link_suggestions', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/article/(?P<post_id>\d+)/publish', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_publish_article', 'permission_callback' => $admin ],
    ]);

    // Taxonomy
    register_rest_route('pa-yt/v1', '/series', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_list_series', 'permission_callback' => $admin ],
    ]);
});

function pays_rest_list_article_queue( WP_REST_Request $req ): WP_REST_Response {
    $status = sanitize_key( $req->get_param('status') ?: '' );
    $limit  = min( (int) ( $req->get_param('limit') ?: 30 ), 100 );
    return new WP_REST_Response( PAYS_Article_Queue::list( $status, $limit ), 200 );
}

function pays_rest_add_article_queue( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $yt_id   = sanitize_text_field( $req->get_param('yt_id') ?: get_post_meta( $post_id, 'pa_youtube_id', true ) );
    $lang    = sanitize_key( $req->get_param('lang') ?: get_option('pays_ai_lang', 'en') );
    $tone    = sanitize_key( $req->get_param('tone') ?: 'formal' );

    if ( ! $post_id || ! $yt_id ) {
        return new WP_REST_Response( [ 'error' => 'post_id and yt_id required' ], 400 );
    }

    $id = PAYS_Article_Queue::add( $post_id, $yt_id, $lang, $tone );
    return new WP_REST_Response( [ 'queue_id' => $id, 'status' => 'pending' ], 201 );
}

function pays_rest_article_queue_counts(): WP_REST_Response {
    return new WP_REST_Response( PAYS_Article_Queue::counts(), 200 );
}

function pays_rest_retry_article( WP_REST_Request $req ): WP_REST_Response {
    $ok = PAYS_Article_Queue::retry( (int) $req->get_param('id') );
    return $ok
        ? new WP_REST_Response( [ 'retried' => true ], 200 )
        : new WP_REST_Response( [ 'error' => 'Not found' ], 404 );
}

function pays_rest_delete_article_job( WP_REST_Request $req ): WP_REST_Response {
    PAYS_Article_Queue::delete( (int) $req->get_param('id') );
    return new WP_REST_Response( null, 204 );
}

function pays_rest_rewrite_article( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $tone    = sanitize_key( $req->get_param('tone') ?: 'formal' );
    $result  = PAYS_Article_Generator::rewrite( $post_id, $tone );
    return is_wp_error( $result )
        ? new WP_REST_Response( [ 'error' => $result->get_error_message() ], 500 )
        : new WP_REST_Response( $result, 200 );
}

function pays_rest_get_link_suggestions( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $saved   = get_post_meta( $post_id, '_pays_link_suggestions', true );
    if ( $saved ) return new WP_REST_Response( $saved, 200 );

    $post = get_post( $post_id );
    $text = $post ? strip_tags( $post->post_content ) : '';
    return new WP_REST_Response( PAYS_Internal_Links::suggest( $text ), 200 );
}

function pays_rest_publish_article( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $result  = wp_update_post( [ 'ID' => $post_id, 'post_status' => 'publish' ] );
    return is_wp_error( $result )
        ? new WP_REST_Response( [ 'error' => $result->get_error_message() ], 500 )
        : new WP_REST_Response( [ 'published' => true, 'url' => get_permalink( $post_id ) ], 200 );
}

/* â”€â”€ Smart Moderation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

add_action( 'rest_api_init', function () {
    $admin = fn() => current_user_can('manage_options');

    // Rules CRUD
    register_rest_route('pa-yt/v1', '/rules', [
        [ 'methods' => 'GET',  'callback' => 'pays_rest_list_rules',  'permission_callback' => $admin ],
        [ 'methods' => 'POST', 'callback' => 'pays_rest_save_rule',   'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/rules/(?P<id>\d+)', [
        [ 'methods' => 'GET',    'callback' => 'pays_rest_get_rule',    'permission_callback' => $admin ],
        [ 'methods' => 'PATCH',  'callback' => 'pays_rest_update_rule', 'permission_callback' => $admin ],
        [ 'methods' => 'DELETE', 'callback' => 'pays_rest_delete_rule', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/rules/(?P<id>\d+)/toggle', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_toggle_rule', 'permission_callback' => $admin ],
    ]);

    // Bulk moderation
    register_rest_route('pa-yt/v1', '/queue/bulk', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_bulk_moderate', 'permission_callback' => $admin ],
    ]);

    // Mod log
    register_rest_route('pa-yt/v1', '/mod-log', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_mod_log', 'permission_callback' => $admin ],
    ]);

    // Telegram test
    register_rest_route('pa-yt/v1', '/telegram/test', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_telegram_test', 'permission_callback' => $admin ],
    ]);

    // Toxicity check
    register_rest_route('pa-yt/v1', '/toxicity/check', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_toxicity_check', 'permission_callback' => $admin ],
    ]);

    // Analytics
    register_rest_route('pa-yt/v1', '/analytics/advanced', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_analytics_advanced', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/analytics/trends', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_analytics_trends', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/analytics/best-times', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_analytics_best_times', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/analytics/report', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_analytics_report', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/analytics/snapshot', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_analytics_snapshot', 'permission_callback' => $admin ],
    ]);
});

function pays_rest_list_rules(): WP_REST_Response {
    return new WP_REST_Response( PAYS_Rule_Engine::get_all_rules(), 200 );
}

function pays_rest_get_rule( WP_REST_Request $req ): WP_REST_Response {
    $rule = PAYS_Rule_Engine::get_rule( (int) $req->get_param('id') );
    return $rule
        ? new WP_REST_Response( $rule, 200 )
        : new WP_REST_Response( [ 'error' => 'Rule not found' ], 404 );
}

function pays_rest_save_rule( WP_REST_Request $req ): WP_REST_Response {
    $data = $req->get_json_params() ?: [];
    if ( empty( $data['name'] ) ) {
        return new WP_REST_Response( [ 'error' => 'name required' ], 400 );
    }
    $id = PAYS_Rule_Engine::save_rule( $data );
    return new WP_REST_Response( PAYS_Rule_Engine::get_rule( $id ), 201 );
}

function pays_rest_update_rule( WP_REST_Request $req ): WP_REST_Response {
    $data       = $req->get_json_params() ?: [];
    $data['id'] = (int) $req->get_param('id');
    if ( ! PAYS_Rule_Engine::get_rule( $data['id'] ) ) {
        return new WP_REST_Response( [ 'error' => 'Rule not found' ], 404 );
    }
    $id = PAYS_Rule_Engine::save_rule( $data );
    return new WP_REST_Response( PAYS_Rule_Engine::get_rule( $id ), 200 );
}

function pays_rest_delete_rule( WP_REST_Request $req ): WP_REST_Response {
    $ok = PAYS_Rule_Engine::delete_rule( (int) $req->get_param('id') );
    return $ok
        ? new WP_REST_Response( null, 204 )
        : new WP_REST_Response( [ 'error' => 'Rule not found' ], 404 );
}

function pays_rest_toggle_rule( WP_REST_Request $req ): WP_REST_Response {
    $id      = (int) $req->get_param('id');
    $enabled = (bool) ( $req->get_json_params()['enabled'] ?? true );
    $ok      = PAYS_Rule_Engine::toggle_rule( $id, $enabled );
    return $ok
        ? new WP_REST_Response( [ 'id' => $id, 'enabled' => $enabled ], 200 )
        : new WP_REST_Response( [ 'error' => 'Rule not found' ], 404 );
}

function pays_rest_bulk_moderate( WP_REST_Request $req ): WP_REST_Response {
    $ids    = array_map( 'intval', (array) ( $req->get_json_params()['ids']    ?? [] ) );
    $action = sanitize_key( $req->get_json_params()['action'] ?? '' );
    if ( empty( $ids ) || ! in_array( $action, [ 'approve', 'reject' ], true ) ) {
        return new WP_REST_Response( [ 'error' => 'ids[] and action (approve|reject) required' ], 400 );
    }
    return new WP_REST_Response( pays_bulk_moderate( $ids, $action ), 200 );
}

function pays_rest_mod_log( WP_REST_Request $req ): WP_REST_Response {
    $limit    = min( (int) ( $req->get_param('limit')    ?: 50 ), 200 );
    $offset   = (int) ( $req->get_param('offset')   ?: 0 );
    $action   = sanitize_key( $req->get_param('action')   ?: '' );
    $queue_id = (int) ( $req->get_param('queue_id') ?: 0 );

    return new WP_REST_Response( [
        'items' => PAYS_Mod_Log::get( $limit, $offset, $action, $queue_id ),
        'total' => PAYS_Mod_Log::count( $action ),
    ], 200 );
}

function pays_rest_telegram_test(): WP_REST_Response {
    $ok = PAYS_Notification::test();
    return new WP_REST_Response( [ 'sent' => $ok ], $ok ? 200 : 500 );
}

function pays_rest_toxicity_check( WP_REST_Request $req ): WP_REST_Response {
    $title = sanitize_text_field( $req->get_json_params()['title'] ?? '' );
    $desc  = sanitize_textarea_field( $req->get_json_params()['description'] ?? '' );
    if ( ! $title ) return new WP_REST_Response( [ 'error' => 'title required' ], 400 );
    return new WP_REST_Response( PAYS_Toxicity::analyze( $title, $desc ), 200 );
}

function pays_rest_list_series(): WP_REST_Response {
    $terms = get_terms([
        'taxonomy'   => 'pa_series',
        'hide_empty' => false,
        'number'     => 100,
    ]);
    if ( is_wp_error( $terms ) ) return new WP_REST_Response( [], 200 );

    $out = array_map( fn( $t ) => [
        'id'          => $t->term_id,
        'name'        => $t->name,
        'slug'        => $t->slug,
        'count'       => $t->count,
        'playlist_id' => get_term_meta( $t->term_id, 'pa_playlist_id', true ),
    ], $terms );

    return new WP_REST_Response( $out, 200 );
}

function pays_rest_analytics_advanced( WP_REST_Request $req ): WP_REST_Response {
    $a   = new PAYS_Analytics();
    $ch  = sanitize_text_field( $req->get_param('channel_id') ?? '' );

    return new WP_REST_Response([
        'summary'    => $a->get_engagement_summary($ch),
        'comparison' => $a->get_format_comparison($ch),
        'top'        => $a->get_top_performers($ch, 10),
        'playlists'  => $a->get_playlist_performance(),
        'growth'     => $a->get_growth_prediction($ch),
    ], 200);
}

function pays_rest_analytics_trends( WP_REST_Request $req ): WP_REST_Response {
    $a    = new PAYS_Analytics();
    $ch   = sanitize_text_field( $req->get_param('channel_id') ?? '' );
    $days = intval( $req->get_param('days') ?? 30 );
    $days = max(7, min(90, $days));
    return new WP_REST_Response( $a->get_channel_trends($ch, $days), 200 );
}

function pays_rest_analytics_best_times( WP_REST_Request $req ): WP_REST_Response {
    $a  = new PAYS_Analytics();
    $ch = sanitize_text_field( $req->get_param('channel_id') ?? '' );
    return new WP_REST_Response( $a->get_best_upload_times($ch), 200 );
}

function pays_rest_analytics_report( WP_REST_Request $req ): WP_REST_Response {
    $a  = new PAYS_Analytics();
    $ch = sanitize_text_field( $req->get_param('channel_id') ?? '' );
    return new WP_REST_Response( $a->get_weekly_report($ch), 200 );
}

function pays_rest_analytics_snapshot(): WP_REST_Response {
    $a     = new PAYS_Analytics();
    $saved = $a->snapshot_all();
    return new WP_REST_Response( [ 'saved' => $saved ], 200 );
}
