<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Mod_Log {

    public static function add(
        int    $queue_id,
        int    $post_id,
        string $action,
        string $note    = '',
        array  $context = []
    ): int {
        global $wpdb;

        $wpdb->insert( $wpdb->prefix . 'pays_mod_log', [
            'queue_id'   => $queue_id,
            'post_id'    => $post_id,
            'user_id'    => get_current_user_id(),
            'action'     => sanitize_key( $action ),
            'note'       => sanitize_textarea_field( $note ),
            'context'    => $context ? wp_json_encode( $context ) : null,
            'created_at' => current_time('mysql'),
        ]);

        return (int) $wpdb->insert_id;
    }

    public static function get(
        int    $limit  = 50,
        int    $offset = 0,
        string $action = '',
        int    $queue_id = 0
    ): array {
        global $wpdb;
        $t   = $wpdb->prefix . 'pays_mod_log';
        $q   = $wpdb->prefix . 'pays_queue';

        $where  = [];
        $params = [];

        if ( $action ) {
            $where[]  = 'l.action = %s';
            $params[] = $action;
        }
        if ( $queue_id ) {
            $where[]  = 'l.queue_id = %d';
            $params[] = $queue_id;
        }

        $clause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $sql    = "SELECT l.*, q.title AS video_title, q.yt_id,
                          u.display_name AS user_name
                   FROM $t l
                   LEFT JOIN $q q ON q.id = l.queue_id
                   LEFT JOIN {$wpdb->users} u ON u.ID = l.user_id
                   $clause
                   ORDER BY l.id DESC
                   LIMIT %d OFFSET %d";

        $params[] = $limit;
        $params[] = $offset;

        return $wpdb->get_results(
            $wpdb->prepare( $sql, ...$params ),
            ARRAY_A
        ) ?: [];
    }

    public static function count( string $action = '' ): int {
        global $wpdb;
        $t = $wpdb->prefix . 'pays_mod_log';
        if ( $action ) {
            return (int) $wpdb->get_var(
                $wpdb->prepare( "SELECT COUNT(*) FROM $t WHERE action = %s", $action )
            );
        }
        return (int) $wpdb->get_var( "SELECT COUNT(*) FROM $t" );
    }
}
