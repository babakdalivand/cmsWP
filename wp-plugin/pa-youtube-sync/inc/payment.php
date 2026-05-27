<?php
/**
 * PAYS_Payment — gateway abstraction layer
 * Supports Stripe and Persian gateways (ZarinPal, IDPay, NextPay).
 * Add new gateways by implementing PAYS_Gateway_Interface.
 */

if ( ! defined('ABSPATH') ) exit;

interface PAYS_Gateway_Interface {
    /** Initiate a payment. Returns ['redirect_url' => string] or ['error' => string]. */
    public function initiate( array $order ): array;
    /** Verify a callback. Returns ['success' => bool, 'ref_id' => string] or ['error' => string]. */
    public function verify( array $params ): array;
    /** Unique gateway identifier. */
    public function id(): string;
}

/* ── Stripe ──────────────────────────────────────────────────────── */

class PAYS_Gateway_Stripe implements PAYS_Gateway_Interface {

    public function id(): string { return 'stripe'; }

    public function initiate( array $order ): array {
        $secret = get_option('pays_stripe_secret_key', '');
        if ( ! $secret ) return [ 'error' => 'Stripe secret key not configured' ];

        $amount   = intval($order['amount_cents']);
        $currency = strtolower($order['currency'] ?? 'usd');
        $success  = $order['success_url'];
        $cancel   = $order['cancel_url'];
        $meta     = $order['metadata'] ?? [];

        $response = wp_remote_post('https://api.stripe.com/v1/checkout/sessions', [
            'headers' => [
                'Authorization' => 'Bearer ' . $secret,
                'Content-Type'  => 'application/x-www-form-urlencoded',
            ],
            'body' => http_build_query( array_merge([
                'payment_method_types[0]' => 'card',
                'mode'                    => 'subscription',
                'success_url'             => $success . '?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url'              => $cancel,
                'line_items[0][price]'    => $order['stripe_price_id'],
                'line_items[0][quantity]' => 1,
            ], array_reduce( array_keys($meta), fn($carry, $k) => array_merge($carry, ["metadata[{$k}]" => $meta[$k]]), [] )) ),
            'timeout' => 15,
        ]);

        if ( is_wp_error($response) ) return [ 'error' => $response->get_error_message() ];

        $body = json_decode( wp_remote_retrieve_body($response), true );
        if ( isset($body['error']) ) return [ 'error' => $body['error']['message'] ];

        return [ 'redirect_url' => $body['url'], 'session_id' => $body['id'] ];
    }

    public function verify( array $params ): array {
        $secret    = get_option('pays_stripe_secret_key', '');
        $session_id = $params['session_id'] ?? '';

        if ( ! $secret || ! $session_id ) return [ 'success' => false, 'error' => 'Missing params' ];

        $response = wp_remote_get("https://api.stripe.com/v1/checkout/sessions/{$session_id}", [
            'headers' => [ 'Authorization' => 'Bearer ' . $secret ],
            'timeout' => 10,
        ]);

        if ( is_wp_error($response) ) return [ 'success' => false, 'error' => $response->get_error_message() ];

        $body = json_decode( wp_remote_retrieve_body($response), true );
        $ok   = ( $body['payment_status'] ?? '' ) === 'paid';

        return [
            'success'        => $ok,
            'ref_id'         => $body['payment_intent'] ?? $session_id,
            'customer_email' => $body['customer_details']['email'] ?? '',
            'metadata'       => $body['metadata'] ?? [],
        ];
    }

    /** Handle Stripe webhook events (called from REST endpoint). */
    public function handle_webhook( string $payload, string $sig ): bool {
        $secret = get_option('pays_stripe_webhook_secret', '');
        if ( ! $secret ) return false;

        // Verify signature
        $timestamp = null;
        $v1_sig    = null;
        foreach ( explode(',', $sig) as $part ) {
            [$k, $v] = explode('=', $part, 2);
            if ( $k === 't' ) $timestamp = $v;
            if ( $k === 'v1' ) $v1_sig = $v;
        }

        $expected = hash_hmac('sha256', "{$timestamp}.{$payload}", $secret);
        if ( ! hash_equals($expected, $v1_sig ?? '') ) return false;

        $event = json_decode($payload, true);
        if ( $event['type'] === 'customer.subscription.deleted' || $event['type'] === 'invoice.payment_failed' ) {
            $user_id = $this->wp_user_from_stripe_customer( $event['data']['object']['customer'] ?? '' );
            if ( $user_id ) PAYS_Membership::cancel_subscription( $user_id, $event['type'] );
        }

        if ( $event['type'] === 'invoice.payment_succeeded' ) {
            $user_id = $this->wp_user_from_stripe_customer( $event['data']['object']['customer'] ?? '' );
            $sub_id  = $event['data']['object']['subscription'] ?? null;
            if ( $user_id && $sub_id ) {
                $level = get_user_meta( $user_id, 'stripe_sub_level', true ) ?: 'basic';
                PAYS_Membership::create_subscription([
                    'user_id'        => $user_id,
                    'access_level'   => $level,
                    'gateway'        => 'stripe',
                    'gateway_sub_id' => $sub_id,
                    'amount'         => floatval($event['data']['object']['amount_paid'] ?? 0) / 100,
                    'currency'       => strtoupper($event['data']['object']['currency'] ?? 'USD'),
                    'expires_at'     => gmdate('Y-m-d H:i:s', intval($event['data']['object']['lines']['data'][0]['period']['end'] ?? 0)),
                ]);
            }
        }

        return true;
    }

    private function wp_user_from_stripe_customer( string $customer_id ): ?int {
        if ( ! $customer_id ) return null;
        global $wpdb;
        $uid = $wpdb->get_var( $wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key='stripe_customer_id' AND meta_value=%s LIMIT 1",
            $customer_id
        ));
        return $uid ? intval($uid) : null;
    }
}

/* ── ZarinPal (Persian gateway) ──────────────────────────────────── */

class PAYS_Gateway_ZarinPal implements PAYS_Gateway_Interface {

    public function id(): string { return 'zarinpal'; }

    public function initiate( array $order ): array {
        $merchant = get_option('pays_zarinpal_merchant', '');
        if ( ! $merchant ) return [ 'error' => 'ZarinPal merchant ID not set' ];

        $response = wp_remote_post('https://api.zarinpal.com/pg/v4/payment/request.json', [
            'headers' => [ 'Content-Type' => 'application/json', 'Accept' => 'application/json' ],
            'body'    => json_encode([
                'merchant_id'  => $merchant,
                'amount'       => intval($order['amount_cents']) * 10, // Toman → Rial
                'currency'     => 'IRT',
                'description'  => $order['description'] ?? 'اشتراک ویژه',
                'callback_url' => $order['success_url'],
                'metadata'     => [ 'order_id' => $order['order_id'] ?? '', 'email' => $order['email'] ?? '' ],
            ]),
            'timeout' => 15,
        ]);

        if ( is_wp_error($response) ) return [ 'error' => $response->get_error_message() ];

        $body = json_decode( wp_remote_retrieve_body($response), true );
        if ( empty($body['data']['authority']) ) {
            return [ 'error' => $body['errors']['message'] ?? 'ZarinPal error' ];
        }

        $auth = $body['data']['authority'];
        return [
            'redirect_url' => "https://www.zarinpal.com/pg/StartPay/{$auth}",
            'authority'    => $auth,
        ];
    }

    public function verify( array $params ): array {
        $merchant  = get_option('pays_zarinpal_merchant', '');
        $authority = $params['Authority'] ?? '';
        $status    = $params['Status']    ?? '';

        if ( $status !== 'OK' ) return [ 'success' => false, 'error' => 'Payment cancelled' ];

        $response = wp_remote_post('https://api.zarinpal.com/pg/v4/payment/verify.json', [
            'headers' => [ 'Content-Type' => 'application/json', 'Accept' => 'application/json' ],
            'body'    => json_encode([
                'merchant_id' => $merchant,
                'amount'      => intval($params['amount'] ?? 0),
                'authority'   => $authority,
            ]),
            'timeout' => 15,
        ]);

        if ( is_wp_error($response) ) return [ 'success' => false, 'error' => $response->get_error_message() ];

        $body = json_decode( wp_remote_retrieve_body($response), true );
        $code = intval($body['data']['code'] ?? 0);

        if ( $code === 100 || $code === 101 ) {
            return [
                'success' => true,
                'ref_id'  => (string) ($body['data']['ref_id'] ?? $authority),
            ];
        }

        return [ 'success' => false, 'error' => $body['errors']['message'] ?? 'Verification failed' ];
    }
}

/* ── IDPay (fallback Persian gateway) ────────────────────────────── */

class PAYS_Gateway_IDPay implements PAYS_Gateway_Interface {

    public function id(): string { return 'idpay'; }

    public function initiate( array $order ): array {
        $api_key = get_option('pays_idpay_api_key', '');
        if ( ! $api_key ) return [ 'error' => 'IDPay API key not set' ];

        $sandbox = get_option('pays_idpay_sandbox', '0') === '1';
        $response = wp_remote_post('https://api.idpay.ir/v1.1/payment', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-KEY'    => $api_key,
                'X-SANDBOX'    => $sandbox ? '1' : '0',
            ],
            'body' => json_encode([
                'order_id'    => $order['order_id'] ?? uniqid(),
                'amount'      => intval($order['amount_cents']),
                'name'        => $order['name']  ?? '',
                'phone'       => $order['phone'] ?? '',
                'mail'        => $order['email'] ?? '',
                'desc'        => $order['description'] ?? 'اشتراک ویژه',
                'callback'    => $order['success_url'],
            ]),
            'timeout' => 15,
        ]);

        if ( is_wp_error($response) ) return [ 'error' => $response->get_error_message() ];

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode( wp_remote_retrieve_body($response), true );

        if ( $code !== 201 ) return [ 'error' => $body['error_message'] ?? 'IDPay error' ];

        return [
            'redirect_url' => $body['link'],
            'id'           => $body['id'],
        ];
    }

    public function verify( array $params ): array {
        $api_key = get_option('pays_idpay_api_key', '');
        $sandbox = get_option('pays_idpay_sandbox', '0') === '1';
        $status  = intval($params['status'] ?? 0);

        if ( $status !== 10 ) return [ 'success' => false, 'error' => 'Payment not completed' ];

        $response = wp_remote_post('https://api.idpay.ir/v1.1/payment/verify', [
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-KEY'    => $api_key,
                'X-SANDBOX'    => $sandbox ? '1' : '0',
            ],
            'body' => json_encode([
                'id'       => $params['id'],
                'order_id' => $params['order_id'],
            ]),
            'timeout' => 15,
        ]);

        if ( is_wp_error($response) ) return [ 'success' => false, 'error' => $response->get_error_message() ];

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode( wp_remote_retrieve_body($response), true );

        return [
            'success' => ( $code === 200 && intval($body['status'] ?? 0) === 100 ),
            'ref_id'  => $body['payment']['track_id'] ?? '',
        ];
    }
}

/* ── Gateway Factory ─────────────────────────────────────────────── */

class PAYS_Payment {

    private static array $gateways = [];

    public static function register( PAYS_Gateway_Interface $gw ): void {
        self::$gateways[$gw->id()] = $gw;
    }

    public static function get( string $id ): ?PAYS_Gateway_Interface {
        return self::$gateways[$id] ?? null;
    }

    public static function available(): array {
        return array_keys( self::$gateways );
    }

    /** Initiate payment and record pending transaction. */
    public static function start( string $gateway_id, array $order ): array {
        $gw = self::get($gateway_id);
        if ( ! $gw ) return [ 'error' => 'Gateway not found: ' . $gateway_id ];

        $result = $gw->initiate($order);
        if ( isset($result['error']) ) return $result;

        // Record transaction
        global $wpdb;
        $wpdb->insert( $wpdb->prefix . 'pays_payment_transactions', [
            'user_id'        => intval($order['user_id'] ?? 0),
            'gateway'        => $gateway_id,
            'order_id'       => $order['order_id'] ?? uniqid(),
            'amount'         => floatval($order['amount_cents']),
            'currency'       => $order['currency'] ?? 'IRR',
            'level'          => $order['access_level'] ?? 'basic',
            'duration_days'  => intval($order['duration_days'] ?? 30),
            'status'         => 'pending',
            'gateway_ref'    => $result['session_id'] ?? $result['authority'] ?? $result['id'] ?? '',
        ], ['%d','%s','%s','%f','%s','%s','%d','%s','%s'] );

        return array_merge($result, [ 'transaction_id' => $wpdb->insert_id ]);
    }

    /** Complete a payment after callback. */
    public static function complete( string $gateway_id, array $params ): array {
        $gw = self::get($gateway_id);
        if ( ! $gw ) return [ 'success' => false, 'error' => 'Gateway not found' ];

        $result = $gw->verify($params);

        global $wpdb;
        $t   = $wpdb->prefix . 'pays_payment_transactions';
        $tid = intval($params['transaction_id'] ?? 0);

        if ( $result['success'] && $tid ) {
            $tx = $wpdb->get_row( $wpdb->prepare("SELECT * FROM {$t} WHERE id=%d", $tid), ARRAY_A );

            if ( $tx && $tx['status'] === 'pending' ) {
                $wpdb->update( $t,
                    [ 'status' => 'completed', 'ref_id' => $result['ref_id'] ?? '', 'completed_at' => current_time('mysql') ],
                    [ 'id' => $tid ],
                    ['%s','%s','%s'], ['%d']
                );

                $expires = gmdate('Y-m-d H:i:s', time() + intval($tx['duration_days']) * 86400);
                PAYS_Membership::create_subscription([
                    'user_id'        => intval($tx['user_id']),
                    'access_level'   => $tx['level'],
                    'gateway'        => $gateway_id,
                    'gateway_sub_id' => $result['ref_id'] ?? '',
                    'amount'         => floatval($tx['amount']),
                    'currency'       => $tx['currency'],
                    'expires_at'     => $expires,
                ]);
            }
        } elseif ( $tid ) {
            $wpdb->update( $t, [ 'status' => 'failed' ], [ 'id' => $tid ], ['%s'], ['%d'] );
        }

        return $result;
    }
}

// Register built-in gateways
PAYS_Payment::register( new PAYS_Gateway_Stripe() );
PAYS_Payment::register( new PAYS_Gateway_ZarinPal() );
PAYS_Payment::register( new PAYS_Gateway_IDPay() );
