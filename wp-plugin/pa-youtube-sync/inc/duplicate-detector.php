<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Duplicate_Detector {

    /**
     * Returns null if no duplicate, or an array with info about the duplicate.
     */
    public static function check( string $yt_id, string $title, string $description = '' ): ?array {
        // 1. Exact YouTube ID match (already imported)
        $exact = self::check_yt_id( $yt_id );
        if ( $exact ) return $exact;

        // 2. Exact YouTube ID in queue (already pending)
        $in_queue = self::check_queue_yt_id( $yt_id );
        if ( $in_queue ) return $in_queue;

        // 3. Title similarity
        $similar = self::check_title_similarity( $title );
        if ( $similar ) return $similar;

        return null;
    }

    /* ── Checks ─────────────────────────────────────────────────── */

    private static function check_yt_id( string $yt_id ): ?array {
        global $wpdb;
        $post_id = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key='pa_youtube_id' AND meta_value=%s LIMIT 1",
                $yt_id
            )
        );

        if ( ! $post_id ) return null;

        return [
            'type'     => 'exact_yt_id',
            'post_id'  => (int) $post_id,
            'title'    => get_the_title( $post_id ),
            'url'      => get_permalink( $post_id ),
            'status'   => get_post_status( $post_id ),
            'score'    => 100,
        ];
    }

    private static function check_queue_yt_id( string $yt_id ): ?array {
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT id, title, status FROM {$wpdb->prefix}pays_queue WHERE yt_id=%s LIMIT 1",
                $yt_id
            ),
            ARRAY_A
        );

        if ( ! $row ) return null;

        return [
            'type'     => 'queue_duplicate',
            'queue_id' => (int) $row['id'],
            'title'    => $row['title'],
            'status'   => $row['status'],
            'score'    => 100,
        ];
    }

    private static function check_title_similarity( string $title ): ?array {
        if ( mb_strlen( $title ) < 15 ) return null; // Too short to compare

        global $wpdb;

        // Fetch recent published post titles
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT ID, post_title FROM {$wpdb->posts}
                 WHERE post_type IN ('pa_video','pa_short','post')
                   AND post_status = 'publish'
                 ORDER BY post_date DESC LIMIT 500"
            ),
            ARRAY_A
        );

        $title_lower = mb_strtolower( $title );

        foreach ( $rows as $r ) {
            $existing_lower = mb_strtolower( $r['post_title'] );
            similar_text( $title_lower, $existing_lower, $pct );

            if ( $pct >= 85 ) {
                return [
                    'type'    => 'similar_title',
                    'post_id' => (int) $r['ID'],
                    'title'   => $r['post_title'],
                    'url'     => get_permalink( $r['ID'] ),
                    'score'   => round( $pct, 1 ),
                ];
            }
        }

        return null;
    }
}
