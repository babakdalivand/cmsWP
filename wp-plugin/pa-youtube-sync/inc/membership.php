<?php
/**
 * PAYS_Membership — premium membership core
 * Access levels, subscriptions, content locking, expiry, Telegram sync.
 */

if ( ! defined('ABSPATH') ) exit;

class PAYS_Membership {

    /* ── Constants ───────────────────────────────────────────────── */
    const LEVELS = [
        'free'    => [ 'label' => 'رایگان',   'priority' => 0 ],
        'basic'   => [ 'label' => 'پایه',      'priority' => 10 ],
        'premium' => [ 'label' => 'ویژه',      'priority' => 20 ],
        'vip'     => [ 'label' => 'VIP',       'priority' => 30 ],
    ];

    /* ── Table helpers ───────────────────────────────────────────── */
    private static function t( string $suffix ): string {
        global $wpdb;
        return $wpdb->prefix . 'pays_' . $suffix;
    }

    /* ── Subscription CRUD ───────────────────────────────────────── */

    public static function get_subscription( int $user_id ): ?array {
        global $wpdb;
        $row = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM " . self::t('subscriptions') . "
             WHERE user_id=%d AND status='active' AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY level_priority DESC LIMIT 1",
            $user_id
        ), ARRAY_A );
        return $row ?: null;
    }

    public static function get_level( int $user_id ): string {
        $sub = self::get_subscription($user_id);
        return $sub ? ( $sub['access_level'] ?? 'free' ) : 'free';
    }

    public static function has_access( int $user_id, string $required_level ): bool {
        $levels   = array_keys( self::LEVELS );
        $user_lvl = self::get_level( $user_id );
        $user_pri = self::LEVELS[$user_lvl]['priority'] ?? 0;
        $req_pri  = self::LEVELS[$required_level]['priority'] ?? 0;
        return $user_pri >= $req_pri;
    }

    public static function create_subscription( array $data ): int {
        global $wpdb;

        $level    = $data['access_level'] ?? 'basic';
        $priority = self::LEVELS[$level]['priority'] ?? 10;

        $wpdb->insert( self::t('subscriptions'), [
            'user_id'       => intval($data['user_id']),
            'access_level'  => $level,
            'level_priority'=> $priority,
            'status'        => $data['status']        ?? 'active',
            'plan_id'       => $data['plan_id']       ?? null,
            'gateway'       => $data['gateway']       ?? 'manual',
            'gateway_sub_id'=> $data['gateway_sub_id']?? null,
            'amount'        => floatval($data['amount']   ?? 0),
            'currency'      => $data['currency']      ?? 'IRR',
            'started_at'    => current_time('mysql'),
            'expires_at'    => $data['expires_at']    ?? null,
            'telegram_synced' => 0,
        ], ['%d','%s','%d','%s','%s','%s','%s','%f','%s','%s','%s','%d'] );

        $id = $wpdb->insert_id;
        self::sync_telegram_member( intval($data['user_id']), $level );
        return $id;
    }

    public static function cancel_subscription( int $user_id, string $reason = '' ): bool {
        global $wpdb;
        $ok = $wpdb->update(
            self::t('subscriptions'),
            [ 'status' => 'cancelled', 'cancelled_at' => current_time('mysql'), 'cancel_reason' => $reason ],
            [ 'user_id' => $user_id, 'status' => 'active' ],
            ['%s','%s','%s'], ['%d','%s']
        );
        if ( $ok ) self::sync_telegram_member( $user_id, 'free' );
        return (bool)$ok;
    }

    public static function expire_subscriptions(): int {
        global $wpdb;
        $expired = $wpdb->get_col(
            "SELECT DISTINCT user_id FROM " . self::t('subscriptions') .
            " WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW()"
        );

        if ( empty($expired) ) return 0;

        $wpdb->query(
            "UPDATE " . self::t('subscriptions') .
            " SET status='expired' WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= NOW()"
        );

        foreach ( $expired as $uid ) {
            self::sync_telegram_member( intval($uid), 'free' );
        }

        return count($expired);
    }

    /* ── Telegram channel sync ───────────────────────────────────── */

    public static function sync_telegram_member( int $user_id, string $new_level ): void {
        $tg_chat_id = get_user_meta( $user_id, 'telegram_chat_id', true );
        if ( ! $tg_chat_id ) return;

        $bot_token  = get_option('pays_telegram_bot_token', '');
        $premium_channel_id = get_option('pays_telegram_premium_channel', '');

        if ( ! $bot_token || ! $premium_channel_id ) return;

        $has_access = self::LEVELS[$new_level]['priority'] >= self::LEVELS['basic']['priority'];
        $method     = $has_access ? 'unbanChatMember' : 'banChatMember';

        $params = [
            'chat_id' => $premium_channel_id,
            'user_id' => $tg_chat_id,
        ];
        if ( ! $has_access ) {
            $params['revoke_messages'] = false;
        }

        $url = "https://api.telegram.org/bot{$bot_token}/{$method}";
        wp_remote_post( $url, [
            'body'    => json_encode($params),
            'headers' => [ 'Content-Type' => 'application/json' ],
            'timeout' => 10,
        ]);
    }

    /* ── Content access check ────────────────────────────────────── */

    public static function post_required_level( int $post_id ): string {
        return get_post_meta( $post_id, '_pays_access_level', true ) ?: 'free';
    }

    public static function user_can_view_post( int $user_id, int $post_id ): bool {
        $required = self::post_required_level( $post_id );
        if ( $required === 'free' ) return true;
        if ( ! $user_id ) return false;
        return self::has_access( $user_id, $required );
    }

    /* ── Token-based access (for non-WP clients) ─────────────────── */

    public static function create_access_token( int $user_id ): string {
        $token = bin2hex( random_bytes(32) );
        global $wpdb;
        $wpdb->insert( self::t('access_tokens'), [
            'user_id'    => $user_id,
            'token_hash' => hash('sha256', $token),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + 3600),
        ], ['%d','%s','%s'] );
        return $token;
    }

    public static function validate_token( string $token ): ?int {
        global $wpdb;
        $hash = hash('sha256', $token);
        $row  = $wpdb->get_row( $wpdb->prepare(
            "SELECT user_id FROM " . self::t('access_tokens') .
            " WHERE token_hash=%s AND expires_at > NOW()",
            $hash
        ), ARRAY_A );
        return $row ? intval($row['user_id']) : null;
    }

    /* ── All subscriptions (admin) ───────────────────────────────── */

    public static function list_subscriptions( array $args = [] ): array {
        global $wpdb;
        $status = sanitize_key( $args['status'] ?? '' );
        $limit  = min( intval($args['limit']  ?? 50), 100 );
        $offset = intval( $args['offset'] ?? 0 );

        $where = $status ? $wpdb->prepare(" AND s.status=%s", $status) : '';

        $rows = $wpdb->get_results(
            "SELECT s.*, u.user_login, u.user_email, u.display_name
             FROM " . self::t('subscriptions') . " s
             LEFT JOIN {$wpdb->users} u ON u.ID = s.user_id
             WHERE 1=1 {$where}
             ORDER BY s.started_at DESC
             LIMIT {$limit} OFFSET {$offset}",
            ARRAY_A
        );

        $total = (int) $wpdb->get_var(
            "SELECT COUNT(*) FROM " . self::t('subscriptions') . " s WHERE 1=1 {$where}"
        );

        return [ 'items' => $rows, 'total' => $total ];
    }

    /* ── Stats ───────────────────────────────────────────────────── */

    public static function stats(): array {
        global $wpdb;
        $t = self::t('subscriptions');
        return $wpdb->get_row(
            "SELECT
               COUNT(*) AS total,
               SUM(status='active')    AS active,
               SUM(status='expired')   AS expired,
               SUM(status='cancelled') AS cancelled,
               SUM(CASE WHEN status='active' AND access_level='premium' THEN 1 ELSE 0 END) AS premium_count,
               SUM(CASE WHEN status='active' AND access_level='vip'     THEN 1 ELSE 0 END) AS vip_count
             FROM {$t}",
            ARRAY_A
        ) ?: [];
    }
}

/* ── Content locking hooks ─────────────────────────────────────── */

add_filter('the_content', function( string $content ): string {
    if ( ! is_singular('pa_video') && ! is_singular('post') ) return $content;

    $post_id  = get_the_ID();
    $required = PAYS_Membership::post_required_level( $post_id );
    if ( $required === 'free' ) return $content;

    $user_id = get_current_user_id();
    if ( PAYS_Membership::user_can_view_post( $user_id, $post_id ) ) return $content;

    $level_label = PAYS_Membership::LEVELS[$required]['label'] ?? $required;
    return '<div class="pays-member-gate" style="border:2px solid #e2c07a;border-radius:12px;padding:24px;text-align:center;background:#fffdf0;">
        <span style="font-size:2em">🔒</span>
        <h3 style="margin:8px 0">محتوای اشتراکی</h3>
        <p>برای مشاهده این محتوا به اشتراک <strong>' . esc_html($level_label) . '</strong> نیاز دارید.</p>
        <a href="' . esc_url( get_permalink( get_option('pays_membership_page') ) ) . '"
           style="display:inline-block;margin-top:12px;padding:10px 24px;background:#e2c07a;color:#000;border-radius:8px;text-decoration:none;font-weight:bold">
           دریافت اشتراک
        </a>
    </div>';
}, 99 );

// Lock transcript meta
add_filter('pays_transcript_access', function( bool $can, int $post_id ): bool {
    $required = PAYS_Membership::post_required_level( $post_id );
    if ( $required === 'free' ) return $can;
    return PAYS_Membership::user_can_view_post( get_current_user_id(), $post_id );
}, 10, 2 );

// Premium RSS: add access level to feed
add_action('rss2_item', function() {
    $post_id = get_the_ID();
    $level   = PAYS_Membership::post_required_level( $post_id );
    if ( $level !== 'free' ) {
        echo '<pays:access_level>' . esc_xml($level) . '</pays:access_level>' . "\n";
    }
});

// Daily cron: expire old subscriptions
add_action('pays_expire_memberships', [ 'PAYS_Membership', 'expire_subscriptions' ]);
if ( ! wp_next_scheduled('pays_expire_memberships') ) {
    wp_schedule_event( time(), 'daily', 'pays_expire_memberships' );
}
