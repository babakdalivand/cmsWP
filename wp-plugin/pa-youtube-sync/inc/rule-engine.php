<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Rule_Engine {

    /**
     * Evaluate all active rules against a queue item.
     * Returns array of applied rule results.
     */
    public static function evaluate( array $item ): array {
        $rules   = self::get_active_rules();
        $applied = [];

        foreach ( $rules as $rule ) {
            if ( ! self::matches( $rule, $item ) ) continue;

            $actions = self::execute_actions( $rule['actions'], $item );
            $applied[] = [
                'rule_id'   => $rule['id'],
                'rule_name' => $rule['name'],
                'actions'   => $actions,
            ];

            // Log the rule application
            PAYS_Mod_Log::add(
                (int) $item['id'],
                (int) ( $item['post_id'] ?? 0 ),
                'rule_applied',
                "Rule \"{$rule['name']}\" applied",
                [ 'rule_id' => $rule['id'], 'actions' => $actions ]
            );

            // Notify if rule has notify action or if notifications enabled
            if ( get_option( 'pays_notify_rules', false ) ) {
                PAYS_Notification::send_rule_applied( $item, $rule['name'], $actions );
            }

            // Terminal rules stop further processing
            $action_types = array_column( $actions, 'type' );
            if ( in_array( 'approve', $action_types, true ) ||
                 in_array( 'reject',  $action_types, true ) ) {
                break;
            }
        }

        return $applied;
    }

    /* ── Condition matching ─────────────────────────────────────── */

    private static function matches( array $rule, array $item ): bool {
        $conditions = $rule['conditions'] ?? [];
        $mode       = $rule['condition_mode'] ?? 'all';

        if ( empty( $conditions ) ) return false;

        $results = array_map( fn( $c ) => self::check_condition( $c, $item ), $conditions );

        return $mode === 'any'
            ? in_array( true, $results, true )
            : ! in_array( false, $results, true );
    }

    private static function check_condition( array $cond, array $item ): bool {
        $field    = $cond['field']    ?? '';
        $operator = $cond['operator'] ?? 'contains';
        $value    = (string) ( $cond['value'] ?? '' );

        $actual = self::field_value( $field, $item );

        return match ( $operator ) {
            'contains'     => str_contains( mb_strtolower( (string) $actual ), mb_strtolower( $value ) ),
            'not_contains' => ! str_contains( mb_strtolower( (string) $actual ), mb_strtolower( $value ) ),
            'starts_with'  => str_starts_with( mb_strtolower( (string) $actual ), mb_strtolower( $value ) ),
            'ends_with'    => str_ends_with( mb_strtolower( (string) $actual ), mb_strtolower( $value ) ),
            'eq'           => (string) $actual === $value,
            'neq'          => (string) $actual !== $value,
            'gt'           => (float) $actual >  (float) $value,
            'gte'          => (float) $actual >= (float) $value,
            'lt'           => (float) $actual <  (float) $value,
            'lte'          => (float) $actual <= (float) $value,
            'regex'        => (bool) @preg_match( "/{$value}/iu", (string) $actual ),
            'in'           => in_array( (string) $actual, array_map( 'trim', explode( ',', $value ) ), true ),
            'not_in'       => ! in_array( (string) $actual, array_map( 'trim', explode( ',', $value ) ), true ),
            default        => false,
        };
    }

    private static function field_value( string $field, array $item ): mixed {
        return match ( $field ) {
            'title'        => $item['title']        ?? '',
            'description'  => $item['description']  ?? '',
            'channel_id'   => $item['channel_id']   ?? '',
            'yt_id'        => $item['yt_id']        ?? '',
            'type'         => $item['type']         ?? 'video',
            'duration_sec' => (int) ( $item['duration_sec'] ?? 0 ),
            'status'       => $item['status']       ?? 'pending',
            default        => $item[ $field ]        ?? '',
        };
    }

    /* ── Action execution ───────────────────────────────────────── */

    private static function execute_actions( array $actions, array $item ): array {
        $results = [];

        foreach ( $actions as $action ) {
            $type    = $action['type']  ?? '';
            $value   = $action['value'] ?? '';
            $success = false;

            switch ( $type ) {
                case 'approve':
                    $success = PAYS_Importer::approve( (int) $item['id'], [] ) !== false;
                    break;

                case 'reject':
                    $success = PAYS_Importer::reject( (int) $item['id'] );
                    break;

                case 'flag_review':
                    $success = self::flag_item( (int) $item['id'], $value ?: 'flagged' );
                    break;

                case 'add_tag':
                    $pid = (int) ( $item['post_id'] ?? 0 );
                    if ( $pid ) {
                        $success = ! is_wp_error( wp_set_post_tags( $pid, [ $value ], true ) );
                    }
                    break;

                case 'set_category':
                    $pid = (int) ( $item['post_id'] ?? 0 );
                    if ( $pid && is_numeric( $value ) ) {
                        $success = ! is_wp_error( wp_set_post_categories( $pid, [ (int) $value ] ) );
                    }
                    break;

                case 'set_series':
                    $pid = (int) ( $item['post_id'] ?? 0 );
                    if ( $pid ) {
                        $term = is_numeric( $value )
                            ? (int) $value
                            : ( term_exists( $value, 'pa_series' )['term_id'] ?? 0 );
                        if ( $term ) $success = ! is_wp_error( wp_set_post_terms( $pid, [ $term ], 'pa_series', true ) );
                    }
                    break;

                case 'set_topic':
                    $pid = (int) ( $item['post_id'] ?? 0 );
                    if ( $pid ) {
                        $term = is_numeric( $value )
                            ? (int) $value
                            : ( term_exists( $value, 'pa_topic' )['term_id'] ?? 0 );
                        if ( $term ) $success = ! is_wp_error( wp_set_post_terms( $pid, [ $term ], 'pa_topic', true ) );
                    }
                    break;

                case 'notify_telegram':
                    $success = PAYS_Notification::send_queue_item( $item, "Rule: {$value}" );
                    break;

                case 'generate_article':
                    $pid   = (int) ( $item['post_id'] ?? 0 );
                    $yt_id = $item['yt_id'] ?? '';
                    if ( $pid && $yt_id ) {
                        $lang    = get_option( 'pays_ai_lang', 'en' );
                        $success = (bool) PAYS_Article_Queue::add( $pid, $yt_id, $lang, $value ?: 'formal' );
                    }
                    break;

                case 'generate_ai_seo':
                    $pid   = (int) ( $item['post_id'] ?? 0 );
                    $yt_id = $item['yt_id'] ?? '';
                    if ( $pid && $yt_id ) {
                        $lang    = get_option( 'pays_ai_lang', 'en' );
                        $result  = PAYS_AI_SEO::generate( $pid, $yt_id, $lang );
                        $success = ! is_wp_error( $result );
                    }
                    break;
            }

            $results[] = [ 'type' => $type, 'value' => $value, 'success' => $success ];
        }

        return $results;
    }

    private static function flag_item( int $queue_id, string $flag ): bool {
        global $wpdb;
        return (bool) $wpdb->update(
            $wpdb->prefix . 'pays_queue',
            [ 'notes' => $flag ],
            [ 'id'    => $queue_id ]
        );
    }

    /* ── Rule CRUD ──────────────────────────────────────────────── */

    public static function get_active_rules(): array {
        return self::get_all_rules( true );
    }

    public static function get_all_rules( bool $only_enabled = false ): array {
        global $wpdb;
        $t   = $wpdb->prefix . 'pays_rules';
        $sql = $only_enabled
            ? "SELECT * FROM $t WHERE enabled=1 ORDER BY priority ASC, id ASC"
            : "SELECT * FROM $t ORDER BY priority ASC, id ASC";

        $rows = $wpdb->get_results( $sql, ARRAY_A ) ?: [];

        return array_map( function ( $r ) {
            $r['conditions'] = json_decode( $r['conditions'] ?? '[]', true ) ?: [];
            $r['actions']    = json_decode( $r['actions']    ?? '[]', true ) ?: [];
            $r['enabled']    = (bool) $r['enabled'];
            return $r;
        }, $rows );
    }

    public static function get_rule( int $id ): ?array {
        global $wpdb;
        $r = $wpdb->get_row(
            $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}pays_rules WHERE id=%d", $id ),
            ARRAY_A
        );
        if ( ! $r ) return null;
        $r['conditions'] = json_decode( $r['conditions'] ?? '[]', true ) ?: [];
        $r['actions']    = json_decode( $r['actions']    ?? '[]', true ) ?: [];
        $r['enabled']    = (bool) $r['enabled'];
        return $r;
    }

    public static function save_rule( array $data ): int {
        global $wpdb;
        $row = [
            'name'           => sanitize_text_field( $data['name']           ?? 'New Rule' ),
            'enabled'        => (int) ( $data['enabled']        ?? 1 ),
            'condition_mode' => in_array( $data['condition_mode'] ?? 'all', [ 'all', 'any' ], true )
                                    ? $data['condition_mode'] : 'all',
            'conditions'     => wp_json_encode( $data['conditions'] ?? [] ),
            'actions'        => wp_json_encode( $data['actions']    ?? [] ),
            'priority'       => max( 1, min( 100, (int) ( $data['priority'] ?? 10 ) ) ),
        ];

        $id = (int) ( $data['id'] ?? 0 );
        if ( $id ) {
            $wpdb->update( $wpdb->prefix . 'pays_rules', $row, [ 'id' => $id ] );
            return $id;
        }
        $wpdb->insert( $wpdb->prefix . 'pays_rules', $row );
        return (int) $wpdb->insert_id;
    }

    public static function delete_rule( int $id ): bool {
        global $wpdb;
        return (bool) $wpdb->delete( $wpdb->prefix . 'pays_rules', [ 'id' => $id ] );
    }

    public static function toggle_rule( int $id, bool $enabled ): bool {
        global $wpdb;
        return (bool) $wpdb->update(
            $wpdb->prefix . 'pays_rules',
            [ 'enabled' => (int) $enabled ],
            [ 'id'      => $id ]
        );
    }
}
