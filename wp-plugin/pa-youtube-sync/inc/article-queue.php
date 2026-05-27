<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Article_Queue {

    /* -------------------------------------------------------
       Queue management
    ------------------------------------------------------- */

    public static function add( int $post_id, string $yt_id, string $lang, string $tone ): int {
        global $wpdb;
        $wpdb->insert(
            $wpdb->prefix . 'pays_article_queue',
            [
                'post_id'    => $post_id,
                'yt_id'      => $yt_id,
                'lang'       => $lang,
                'tone'       => $tone,
                'status'     => 'pending',
                'created_at' => current_time('mysql'),
            ]
        );

        // Schedule async processing (Action Scheduler / WP cron)
        if ( ! wp_next_scheduled('pays_process_article_queue') ) {
            wp_schedule_single_event( time() + 5, 'pays_process_article_queue' );
        }

        return (int) $wpdb->insert_id;
    }

    public static function process_next(): void {
        global $wpdb;
        $t = $wpdb->prefix . 'pays_article_queue';

        $item = $wpdb->get_row(
            "SELECT * FROM $t WHERE status = 'pending' AND retries < 3 ORDER BY created_at ASC LIMIT 1",
            ARRAY_A
        );

        if ( ! $item ) return;

        $wpdb->update( $t, [ 'status' => 'processing' ], [ 'id' => $item['id'] ] );

        $result = PAYS_Article_Generator::generate(
            (int) $item['post_id'],
            $item['yt_id'],
            $item['lang'],
            $item['tone']
        );

        if ( is_wp_error( $result ) ) {
            $retries  = (int) $item['retries'] + 1;
            $new_status = $retries >= 3 ? 'failed' : 'pending';
            $wpdb->update( $t, [
                'status'    => $new_status,
                'retries'   => $retries,
                'error_msg' => $result->get_error_message(),
            ], [ 'id' => $item['id'] ] );

            // Reschedule if still pending
            if ( $new_status === 'pending' ) {
                wp_schedule_single_event( time() + 60 * $retries, 'pays_process_article_queue' );
            }
        } else {
            $wpdb->update( $t, [
                'status'       => 'done',
                'error_msg'    => null,
                'processed_at' => current_time('mysql'),
            ], [ 'id' => $item['id'] ] );

            // Check if more pending items exist
            $pending = (int) $wpdb->get_var("SELECT COUNT(*) FROM $t WHERE status='pending' AND retries<3");
            if ( $pending > 0 ) {
                wp_schedule_single_event( time() + 2, 'pays_process_article_queue' );
            }
        }
    }

    public static function list( string $status = '', int $limit = 30 ): array {
        global $wpdb;
        $t   = $wpdb->prefix . 'pays_article_queue';
        $sql = "SELECT q.*, p.post_title, p.post_status AS wp_status
                FROM $t q
                LEFT JOIN {$wpdb->posts} p ON p.ID = q.post_id";

        if ( $status ) {
            $sql .= $wpdb->prepare( ' WHERE q.status = %s', $status );
        }

        $sql .= " ORDER BY q.created_at DESC LIMIT {$limit}";

        return $wpdb->get_results( $sql, ARRAY_A ) ?: [];
    }

    public static function retry( int $id ): bool {
        global $wpdb;
        $rows = $wpdb->update(
            $wpdb->prefix . 'pays_article_queue',
            [ 'status' => 'pending', 'retries' => 0, 'error_msg' => null ],
            [ 'id' => $id ]
        );
        if ( $rows ) {
            wp_schedule_single_event( time() + 5, 'pays_process_article_queue' );
        }
        return (bool) $rows;
    }

    public static function delete( int $id ): bool {
        global $wpdb;
        return (bool) $wpdb->delete(
            $wpdb->prefix . 'pays_article_queue',
            [ 'id' => $id ],
            [ '%d' ]
        );
    }

    public static function counts(): array {
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT status, COUNT(*) AS n FROM {$wpdb->prefix}pays_article_queue GROUP BY status",
            ARRAY_A
        );
        $out = [ 'pending' => 0, 'processing' => 0, 'done' => 0, 'failed' => 0 ];
        foreach ( $rows as $r ) {
            if ( isset( $out[ $r['status'] ] ) ) {
                $out[ $r['status'] ] = (int) $r['n'];
            }
        }
        return $out;
    }
}

// WP-cron worker
add_action( 'pays_process_article_queue', function () {
    PAYS_Article_Queue::process_next();
});
