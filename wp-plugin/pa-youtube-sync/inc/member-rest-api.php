<?php
/**
 * Membership REST API — /wp-json/pa-yt/v1/membership/*
 */

if ( ! defined('ABSPATH') ) exit;

add_action('rest_api_init', function() {
    $admin  = fn() => current_user_can('manage_options');
    $authed = fn() => is_user_logged_in();

    /* ── Subscription endpoints ──────────────────────────────────── */
    register_rest_route('pa-yt/v1', '/membership/levels', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_membership_levels', 'permission_callback' => '__return_true' ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/plans', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_membership_plans', 'permission_callback' => '__return_true' ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/my', [
        [ 'methods' => 'GET',    'callback' => 'pays_rest_my_subscription', 'permission_callback' => $authed ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/check/(?P<post_id>\d+)', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_check_access', 'permission_callback' => '__return_true' ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/token', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_get_access_token', 'permission_callback' => $authed ],
    ]);

    /* ── Payment ─────────────────────────────────────────────────── */
    register_rest_route('pa-yt/v1', '/membership/pay/start', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_pay_start', 'permission_callback' => $authed ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/pay/verify/(?P<gateway>[a-z]+)', [
        [ 'methods' => 'GET|POST', 'callback' => 'pays_rest_pay_verify', 'permission_callback' => '__return_true' ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/pay/webhook/stripe', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_stripe_webhook', 'permission_callback' => '__return_true' ],
    ]);

    /* ── Admin endpoints ─────────────────────────────────────────── */
    register_rest_route('pa-yt/v1', '/membership/admin/subscriptions', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_admin_subscriptions', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/grant', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_admin_grant', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/cancel/(?P<user_id>\d+)', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_admin_cancel', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/stats', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_admin_stats', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/post/(?P<post_id>\d+)/level', [
        [ 'methods' => 'PATCH', 'callback' => 'pays_rest_set_post_level', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/expire', [
        [ 'methods' => 'POST', 'callback' => 'pays_rest_run_expire', 'permission_callback' => $admin ],
    ]);
    register_rest_route('pa-yt/v1', '/membership/admin/transactions', [
        [ 'methods' => 'GET', 'callback' => 'pays_rest_admin_transactions', 'permission_callback' => $admin ],
    ]);
});

/* ── Handlers ────────────────────────────────────────────────────── */

function pays_rest_membership_levels(): WP_REST_Response {
    return new WP_REST_Response( PAYS_Membership::LEVELS, 200 );
}

function pays_rest_membership_plans(): WP_REST_Response {
    $plans = get_option('pays_membership_plans', [
        [
            'id'           => 'basic_monthly',
            'level'        => 'basic',
            'label'        => 'پایه — ماهانه',
            'price_toman'  => 49000,
            'price_usd'    => 3,
            'duration_days'=> 30,
            'stripe_price' => '',
            'features'     => ['دسترسی به محتوای پایه', 'بدون تبلیغات', 'پشتیبانی ایمیل'],
        ],
        [
            'id'           => 'premium_monthly',
            'level'        => 'premium',
            'label'        => 'ویژه — ماهانه',
            'price_toman'  => 89000,
            'price_usd'    => 5,
            'duration_days'=> 30,
            'stripe_price' => '',
            'features'     => ['همه امکانات پایه', 'دانلود ویدیوها', 'ترنسکریپت کامل', 'کانال تلگرام ویژه'],
        ],
        [
            'id'           => 'vip_monthly',
            'level'        => 'vip',
            'label'        => 'VIP — ماهانه',
            'price_toman'  => 149000,
            'price_usd'    => 9,
            'duration_days'=> 30,
            'stripe_price' => '',
            'features'     => ['همه امکانات ویژه', 'دسترسی زودهنگام', 'جلسات Q&A اختصاصی', 'لینک دانلود مستقیم'],
        ],
    ]);
    return new WP_REST_Response( $plans, 200 );
}

function pays_rest_my_subscription(): WP_REST_Response {
    $uid = get_current_user_id();
    $sub = PAYS_Membership::get_subscription($uid);
    return new WP_REST_Response([
        'subscription' => $sub,
        'level'        => PAYS_Membership::get_level($uid),
        'levels'       => PAYS_Membership::LEVELS,
    ], 200);
}

function pays_rest_check_access( WP_REST_Request $req ): WP_REST_Response {
    $post_id  = (int) $req->get_param('post_id');
    $user_id  = get_current_user_id();
    $required = PAYS_Membership::post_required_level($post_id);
    $can      = PAYS_Membership::user_can_view_post($user_id, $post_id);

    return new WP_REST_Response([
        'can_view'       => $can,
        'required_level' => $required,
        'user_level'     => PAYS_Membership::get_level($user_id),
    ], 200);
}

function pays_rest_get_access_token(): WP_REST_Response {
    $uid   = get_current_user_id();
    $token = PAYS_Membership::create_access_token($uid);
    return new WP_REST_Response([ 'token' => $token, 'expires_in' => 3600 ], 200);
}

function pays_rest_pay_start( WP_REST_Request $req ): WP_REST_Response {
    $params  = $req->get_json_params();
    $plan_id = sanitize_text_field($params['plan_id'] ?? '');
    $gateway = sanitize_key($params['gateway'] ?? 'zarinpal');
    $user_id = get_current_user_id();

    $plans = get_option('pays_membership_plans', []);
    $plan  = null;
    foreach ($plans as $p) {
        if ($p['id'] === $plan_id) { $plan = $p; break; }
    }
    if (!$plan) return new WP_REST_Response(['error' => 'Plan not found'], 404);

    $user = wp_get_current_user();
    $order = [
        'user_id'      => $user_id,
        'order_id'     => 'ORD-' . $user_id . '-' . time(),
        'access_level' => $plan['level'],
        'duration_days'=> $plan['duration_days'],
        'amount_cents' => $gateway === 'stripe'
            ? intval($plan['price_usd'] * 100)
            : intval($plan['price_toman']),
        'currency'     => $gateway === 'stripe' ? 'USD' : 'IRR',
        'description'  => 'اشتراک ' . $plan['label'],
        'email'        => $user->user_email,
        'name'         => $user->display_name,
        'success_url'  => site_url('/membership/callback/' . $gateway . '/'),
        'cancel_url'   => site_url('/subscribe/'),
        'stripe_price_id' => $plan['stripe_price'] ?? '',
        'metadata'     => [ 'plan_id' => $plan_id, 'user_id' => $user_id ],
    ];

    $result = PAYS_Payment::start($gateway, $order);
    if (isset($result['error'])) return new WP_REST_Response(['error' => $result['error']], 400);

    return new WP_REST_Response($result, 200);
}

function pays_rest_pay_verify( WP_REST_Request $req ): WP_REST_Response {
    $gateway = sanitize_key($req->get_param('gateway') ?? '');
    $params  = array_merge( (array) $req->get_query_params(), (array) $req->get_json_params() );

    $result = PAYS_Payment::complete($gateway, $params);
    return new WP_REST_Response($result, $result['success'] ? 200 : 400);
}

function pays_rest_stripe_webhook( WP_REST_Request $req ): WP_REST_Response {
    $payload = $req->get_body();
    $sig     = $req->get_header('stripe-signature') ?? '';

    $gw = PAYS_Payment::get('stripe');
    if (!($gw instanceof PAYS_Gateway_Stripe)) return new WP_REST_Response(['ok' => false], 400);

    $ok = $gw->handle_webhook($payload, $sig);
    return new WP_REST_Response(['ok' => $ok], $ok ? 200 : 400);
}

function pays_rest_admin_subscriptions( WP_REST_Request $req ): WP_REST_Response {
    $result = PAYS_Membership::list_subscriptions([
        'status' => sanitize_key($req->get_param('status') ?? ''),
        'limit'  => intval($req->get_param('limit') ?? 50),
        'offset' => intval($req->get_param('offset') ?? 0),
    ]);
    return new WP_REST_Response($result, 200);
}

function pays_rest_admin_grant( WP_REST_Request $req ): WP_REST_Response {
    $p = $req->get_json_params();
    $user_id = intval($p['user_id'] ?? 0);
    if (!$user_id || !get_userdata($user_id)) return new WP_REST_Response(['error' => 'User not found'], 404);

    $days    = intval($p['days'] ?? 30);
    $expires = $days > 0 ? gmdate('Y-m-d H:i:s', time() + $days * 86400) : null;

    $id = PAYS_Membership::create_subscription([
        'user_id'      => $user_id,
        'access_level' => sanitize_key($p['level'] ?? 'basic'),
        'gateway'      => 'manual',
        'amount'       => 0,
        'currency'     => 'IRR',
        'expires_at'   => $expires,
    ]);

    return new WP_REST_Response(['subscription_id' => $id], 201);
}

function pays_rest_admin_cancel( WP_REST_Request $req ): WP_REST_Response {
    $uid    = (int) $req->get_param('user_id');
    $reason = sanitize_text_field($req->get_json_params()['reason'] ?? 'admin_cancel');
    $ok     = PAYS_Membership::cancel_subscription($uid, $reason);
    return $ok ? new WP_REST_Response(null, 204) : new WP_REST_Response(['error' => 'No active subscription'], 404);
}

function pays_rest_admin_stats(): WP_REST_Response {
    return new WP_REST_Response(PAYS_Membership::stats(), 200);
}

function pays_rest_set_post_level( WP_REST_Request $req ): WP_REST_Response {
    $post_id = (int) $req->get_param('post_id');
    $level   = sanitize_key($req->get_json_params()['level'] ?? 'free');
    if (!array_key_exists($level, PAYS_Membership::LEVELS)) {
        return new WP_REST_Response(['error' => 'Invalid level'], 400);
    }
    update_post_meta($post_id, '_pays_access_level', $level);
    return new WP_REST_Response(['post_id' => $post_id, 'level' => $level], 200);
}

function pays_rest_run_expire(): WP_REST_Response {
    $count = PAYS_Membership::expire_subscriptions();
    return new WP_REST_Response(['expired' => $count], 200);
}

function pays_rest_admin_transactions( WP_REST_Request $req ): WP_REST_Response {
    global $wpdb;
    $t      = $wpdb->prefix . 'pays_payment_transactions';
    $limit  = min((int)($req->get_param('limit') ?? 50), 100);
    $offset = (int)($req->get_param('offset') ?? 0);

    $rows  = $wpdb->get_results("SELECT * FROM {$t} ORDER BY created_at DESC LIMIT {$limit} OFFSET {$offset}", ARRAY_A);
    $total = (int)$wpdb->get_var("SELECT COUNT(*) FROM {$t}");

    return new WP_REST_Response(['items' => $rows, 'total' => $total], 200);
}
