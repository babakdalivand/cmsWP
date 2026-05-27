<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Notification {

    public static function send( string $message, string $parse_mode = 'HTML' ): bool {
        $token   = get_option( 'pays_telegram_token', '' );
        $chat_id = get_option( 'pays_telegram_chat_id', '' );

        if ( ! $token || ! $chat_id ) return false;

        $resp = wp_remote_post(
            "https://api.telegram.org/bot{$token}/sendMessage",
            [
                'timeout' => 10,
                'body'    => [
                    'chat_id'                  => $chat_id,
                    'text'                     => $message,
                    'parse_mode'               => $parse_mode,
                    'disable_web_page_preview' => true,
                ],
            ]
        );

        return ! is_wp_error( $resp )
            && wp_remote_retrieve_response_code( $resp ) === 200;
    }

    public static function send_queue_item( array $item, string $reason = '' ): bool {
        $title   = esc_html( mb_substr( $item['title'] ?? '', 0, 80 ) );
        $yt_id   = $item['yt_id'] ?? '';
        $type    = strtoupper( $item['type'] ?? 'video' );
        $channel = $item['channel_id'] ?? '';
        $dur     = (int) ( $item['duration_sec'] ?? 0 );
        $dur_str = $dur ? gmdate( 'H:i:s', $dur ) : 'unknown';

        $yt_url  = $yt_id ? "https://youtube.com/watch?v={$yt_id}" : '';
        $mod_url = admin_url( 'admin.php?page=pays-ai-seo#moderation' );

        $lines = [
            "🎬 <b>New Video in Queue</b>",
            "",
            "📌 <b>Title:</b> {$title}",
            "📂 <b>Type:</b> {$type}",
            "⏱ <b>Duration:</b> {$dur_str}",
        ];

        if ( $reason ) $lines[] = "⚡ <b>Reason:</b> " . esc_html( $reason );
        if ( $yt_url ) $lines[] = "🔗 <a href='{$yt_url}'>Watch on YouTube</a>";
        $lines[] = "🛠 <a href='{$mod_url}'>Moderate</a>";

        return self::send( implode( "\n", $lines ) );
    }

    public static function send_bulk_result( int $approved, int $rejected, string $by = '' ): bool {
        $user  = $by ?: ( wp_get_current_user()->display_name ?? 'System' );
        $total = $approved + $rejected;
        return self::send(
            "✅ <b>Bulk Moderation Done</b>\n\n" .
            "👤 By: {$user}\n" .
            "📊 Total: {$total} | ✓ Approved: {$approved} | ✗ Rejected: {$rejected}"
        );
    }

    public static function send_rule_applied( array $item, string $rule_name, array $actions ): bool {
        $title       = esc_html( mb_substr( $item['title'] ?? '', 0, 60 ) );
        $action_list = implode( ', ', array_column( $actions, 'type' ) );

        return self::send(
            "⚙️ <b>Rule Applied</b>\n\n" .
            "📜 Rule: {$rule_name}\n" .
            "🎬 Video: {$title}\n" .
            "🔧 Actions: {$action_list}"
        );
    }

    public static function test(): bool {
        return self::send( '✅ <b>PA YouTube Sync notification test</b>\n\nTelegram notifications are working correctly!' );
    }
}
