<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * PubSubHubbub (WebSub) — real-time YouTube push notifications
 *
 * Subscribe:  POST to https://pubsubhubbub.appspot.com/subscribe
 * Topic:      https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC...
 * Callback:   https://yoursite.com/wp-json/pa-yt/v1/webhook
 */

/* ── Subscribe a channel ────────────────────────────────────────────── */

function pays_subscribe_channel( string $channel_id, string $mode = 'subscribe' ): bool {
    $topic    = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=' . urlencode($channel_id);
    $callback = rest_url('pa-yt/v1/webhook');
    $secret   = get_option('pays_webhook_secret', '');

    $res = wp_remote_post('https://pubsubhubbub.appspot.com/subscribe', [
        'body' => [
            'hub.callback'      => $callback,
            'hub.topic'         => $topic,
            'hub.verify'        => 'async',
            'hub.mode'          => $mode,
            'hub.lease_seconds' => 432000,  // 5 days
            'hub.secret'        => $secret,
        ],
        'timeout' => 15,
    ]);

    return ! is_wp_error($res) && in_array(wp_remote_retrieve_response_code($res), [200,202,204], true);
}

/* ── Generate a webhook secret on first use ─────────────────────────── */

add_action('init', function() {
    if ( ! get_option('pays_webhook_secret') ) {
        update_option('pays_webhook_secret', wp_generate_password(32, false));
    }
});

/* ── Re-subscribe cron (every 4 days, before lease expires) ─────────── */

function pays_schedule_resub(): void {
    if ( ! wp_next_scheduled('pays_resub_event') ) {
        wp_schedule_event(time() + 4 * DAY_IN_SECONDS, 'daily', 'pays_resub_event');
    }
}
add_action('pays_resub_event', function() {
    foreach ( get_option('pays_channels', []) as $ch ) {
        if ( ! empty($ch['enabled']) ) pays_subscribe_channel($ch['id']);
    }
});

/* ── Subscribe all channels when they are saved/added ───────────────── */

add_action('update_option_pays_channels', function($old, $new) {
    $old_ids = array_column((array)$old, 'id');
    foreach ((array)$new as $ch) {
        if (!in_array($ch['id'], $old_ids, true) && !empty($ch['enabled'])) {
            pays_subscribe_channel($ch['id']);
        }
    }
}, 10, 2);

/* ── REST callback ──────────────────────────────────────────────────── */

add_action('rest_api_init', function() {
    register_rest_route('pa-yt/v1', '/webhook', [
        ['methods' => 'GET',  'callback' => 'pays_webhook_verify', 'permission_callback' => '__return_true'],
        ['methods' => 'POST', 'callback' => 'pays_webhook_receive', 'permission_callback' => '__return_true'],
    ]);
});

/* Hub sends GET with hub.challenge to verify our callback */
function pays_webhook_verify( WP_REST_Request $req ): WP_REST_Response {
    $challenge = $req->get_param('hub.challenge');
    if ( $challenge ) {
        return new WP_REST_Response($challenge, 200, ['Content-Type' => 'text/plain']);
    }
    return new WP_REST_Response('', 400);
}

/* Hub sends POST with Atom XML feed when a new video is published */
function pays_webhook_receive( WP_REST_Request $req ): WP_REST_Response {
    $body = $req->get_body();
    if ( ! $body ) return new WP_REST_Response('', 204);

    // Optional HMAC verification
    $secret = get_option('pays_webhook_secret', '');
    $sig    = $req->get_header('x-hub-signature');
    if ( $secret && $sig ) {
        [$algo, $hash] = explode('=', $sig, 2) + [null, null];
        if ( ! hash_equals(hash_hmac($algo ?: 'sha1', $body, $secret), (string)$hash) ) {
            return new WP_REST_Response('', 403);
        }
    }

    // Parse Atom XML
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($body);
    if ( ! $xml ) return new WP_REST_Response('', 204);

    $xml->registerXPathNamespace('yt', 'http://www.youtube.com/xml/schemas/2015');
    $xml->registerXPathNamespace('at', 'http://www.w3.org/2005/Atom');

    foreach ( $xml->entry ?? [] as $entry ) {
        $entry->registerXPathNamespace('yt', 'http://www.youtube.com/xml/schemas/2015');
        $yt_id     = (string)($entry->xpath('yt:videoId')[0] ?? '');
        $ch_id     = (string)($entry->xpath('yt:channelId')[0] ?? '');
        $title     = (string)($entry->title ?? '');
        $published = (string)($entry->published ?? '');

        if (!$yt_id || !$ch_id) continue;

        // Only process channels we track
        $channels = get_option('pays_channels', []);
        $tracked  = array_filter($channels, fn($c) => $c['id'] === $ch_id && !empty($c['enabled']));
        if (!$tracked) continue;

        // Need full details for duration (to detect shorts)
        $api_key = get_option('pays_api_key', '');
        if ($api_key) {
            $api     = new PAYS_API($api_key);
            $details = $api->video_details([$yt_id]);
            if ($details[$yt_id] ?? null) {
                $video = $details[$yt_id];
                PAYS_Importer::enqueue(
                    $yt_id, $ch_id,
                    $video['snippet'],
                    $video['contentDetails']['duration'] ?? 'PT0S'
                );
            }
        } else {
            // Fallback without API key — duration unknown, treat as video
            PAYS_Importer::enqueue($yt_id, $ch_id, [
                'title'        => $title,
                'description'  => '',
                'publishedAt'  => $published,
                'thumbnails'   => ['high'=>['url'=>"https://img.youtube.com/vi/{$yt_id}/hqdefault.jpg"]],
            ], 'PT5M');
        }
    }

    return new WP_REST_Response('', 204);
}
