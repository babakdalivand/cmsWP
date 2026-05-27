<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Schema {

    public static function generate( int $post_id, string $yt_id = '' ): string {
        $post = get_post( $post_id );
        if ( ! $post ) return '{}';

        if ( ! $yt_id ) {
            $yt_id = (string) get_post_meta( $post_id, 'pa_youtube_id', true );
        }

        $duration_sec = (int) get_post_meta( $post_id, 'pa_duration_sec', true );
        $thumbnail    = get_the_post_thumbnail_url( $post_id, 'large' )
                      ?: ( $yt_id ? "https://img.youtube.com/vi/{$yt_id}/maxresdefault.jpg" : '' );

        $video = [
            '@context'     => 'https://schema.org',
            '@type'        => 'VideoObject',
            'name'         => get_the_title( $post_id ),
            'description'  => get_the_excerpt( $post_id ) ?: wp_trim_words( $post->post_content, 30 ),
            'thumbnailUrl' => $thumbnail,
            'uploadDate'   => get_the_date( 'c', $post_id ),
            'url'          => get_permalink( $post_id ),
        ];

        if ( $yt_id ) {
            $video['embedUrl']   = "https://www.youtube.com/embed/{$yt_id}";
            $video['contentUrl'] = "https://www.youtube.com/watch?v={$yt_id}";
        }

        if ( $duration_sec > 0 ) {
            $video['duration'] = self::to_iso8601( $duration_sec );
        }

        // Check for saved FAQ
        $faq_items = self::get_faq( $post_id );
        if ( ! empty( $faq_items ) ) {
            $faq_page = [
                '@context'   => 'https://schema.org',
                '@type'      => 'FAQPage',
                'mainEntity' => array_map( fn( $f ) => [
                    '@type'          => 'Question',
                    'name'           => $f['question'] ?? '',
                    'acceptedAnswer' => [ '@type' => 'Answer', 'text' => $f['answer'] ?? '' ],
                ], $faq_items ),
            ];

            return wp_json_encode( [ $video, $faq_page ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT );
        }

        return wp_json_encode( $video, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT );
    }

    public static function inject(): void {
        if ( ! is_singular( [ 'pa_video', 'pa_short', 'pa_podcast' ] ) ) return;

        $post_id = get_the_ID();
        $yt_id   = (string) get_post_meta( $post_id, 'pa_youtube_id', true );

        // Try cached schema from AI content table
        global $wpdb;
        $cached = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT schema_json FROM {$wpdb->prefix}pays_ai_content WHERE post_id = %d LIMIT 1",
                $post_id
            )
        );

        $json = ( $cached && $cached !== '{}' ) ? $cached : self::generate( $post_id, $yt_id );

        if ( $json && $json !== '{}' ) {
            echo '<script type="application/ld+json">' . $json . '</script>' . "\n";
        }
    }

    /* -------------------------------------------------------
       Meta description injection
    ------------------------------------------------------- */

    public static function inject_meta(): void {
        if ( ! is_singular( [ 'pa_video', 'pa_short', 'pa_podcast' ] ) ) return;

        $post_id = get_the_ID();
        $desc    = get_post_meta( $post_id, '_pays_meta_description', true );
        if ( $desc ) {
            echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
        }
    }

    /* -------------------------------------------------------
       Helpers
    ------------------------------------------------------- */

    private static function get_faq( int $post_id ): array {
        global $wpdb;
        $raw = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT faq_schema FROM {$wpdb->prefix}pays_ai_content WHERE post_id = %d LIMIT 1",
                $post_id
            )
        );
        if ( ! $raw ) return [];
        $items = json_decode( $raw, true );
        return is_array( $items ) ? $items : [];
    }

    private static function to_iso8601( int $sec ): string {
        $h = (int) floor( $sec / 3600 );
        $m = (int) floor( ( $sec % 3600 ) / 60 );
        $s = $sec % 60;
        $d = 'PT';
        if ( $h ) $d .= "{$h}H";
        if ( $m ) $d .= "{$m}M";
        if ( $s || ( ! $h && ! $m ) ) $d .= "{$s}S";
        return $d;
    }
}

add_action( 'wp_head', [ 'PAYS_Schema', 'inject'      ], 5 );
add_action( 'wp_head', [ 'PAYS_Schema', 'inject_meta' ], 5 );
