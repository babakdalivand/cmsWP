<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Importer {

    private PAYS_API $api;

    public function __construct( PAYS_API $api ) { $this->api = $api; }

    /* ── Add a video to the queue (called from webhook or cron) ─────── */

    public static function enqueue( string $yt_id, string $channel_id, array $snippet, string $duration_iso = 'PT0S', int $yt_views = 0 ): bool {
        global $wpdb;
        $q = $wpdb->prefix . 'pays_queue';

        // Already in queue or imported?
        if ( $wpdb->get_var($wpdb->prepare("SELECT id FROM $q WHERE yt_id=%s", $yt_id)) ) return false;
        if ( $wpdb->get_var($wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key='pa_youtube_id' AND meta_value=%s LIMIT 1", $yt_id
        )) ) return false;

        $sec  = PAYS_API::duration_seconds($duration_iso);
        $type = PAYS_API::is_short($duration_iso, $snippet['title'] ?? '', $snippet['description'] ?? '') ? 'short' : 'video';
        $pub  = $snippet['publishedAt'] ?? null;

        $wpdb->insert($q, [
            'yt_id'        => $yt_id,
            'channel_id'   => $channel_id,
            'type'         => $type,
            'title'        => wp_strip_all_tags($snippet['title'] ?? ''),
            'description'  => wp_strip_all_tags($snippet['description'] ?? ''),
            'thumbnail'    => $snippet['thumbnails']['high']['url'] ?? $snippet['thumbnails']['medium']['url'] ?? '',
            'duration_sec' => $sec,
            'yt_views'     => $yt_views,
            'published_at' => $pub ? date('Y-m-d H:i:s', strtotime($pub)) : null,
            'status'       => 'pending',
        ]);
        return (bool)$wpdb->insert_id;
    }

    /* ── Approve a queued video → create WP post ────────────────────── */

    public static function approve( int $queue_id, array $override = [] ): int|false {
        global $wpdb;
        $q   = $wpdb->prefix . 'pays_queue';
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM $q WHERE id=%d AND status='pending'", $queue_id), ARRAY_A);
        if (!$row) return false;

        $channels  = get_option('pays_channels', []);
        $ch        = array_values(array_filter($channels, fn($c) => $c['id'] === $row['channel_id']))[0] ?? [];
        $lang      = $override['lang']  ?? $ch['lang']  ?? 'fa';
        $title     = $override['title'] ?? $row['title'];
        $content   = $override['description'] ?? $row['description'];
        $post_type = $row['type'] === 'short' ? 'pa_short' : 'pa_video';

        $post_id = wp_insert_post([
            'post_title'   => $title,
            'post_content' => $content,
            'post_excerpt' => wp_trim_words($content, 30),
            'post_type'    => $post_type,
            'post_status'  => 'publish',
            'post_date'    => $row['published_at'] ?: current_time('mysql'),
        ]);
        if ( is_wp_error($post_id) ) return false;

        update_post_meta($post_id, 'pa_youtube_id', $row['yt_id']);
        update_post_meta($post_id, 'pa_lang', $lang);
        if ($row['duration_sec']) update_post_meta($post_id, 'pa_duration', PAYS_API::format_duration((int)$row['duration_sec']));

        // Attach thumbnail
        if ($row['thumbnail']) self::attach_thumbnail($post_id, $row['yt_id'], $row['thumbnail']);

        // Update queue row
        $wpdb->update($q, ['status'=>'approved','post_id'=>$post_id,'reviewed_at'=>current_time('mysql')], ['id'=>$queue_id]);

        // Log
        $wpdb->insert($wpdb->prefix.'pays_log', [
            'channel_id' => $row['channel_id'],
            'yt_id'      => $row['yt_id'],
            'post_id'    => $post_id,
            'type'       => $row['type'],
            'action'     => 'approved',
        ]);

        return $post_id;
    }

    /* ── Reject a queued video ──────────────────────────────────────── */

    public static function reject( int $queue_id ): bool {
        global $wpdb;
        $q = $wpdb->prefix . 'pays_queue';
        return (bool)$wpdb->update($q, ['status'=>'rejected','reviewed_at'=>current_time('mysql')], ['id'=>$queue_id]);
    }

    /* ── Sync channel → enqueue new videos ─────────────────────────── */

    public function sync_channel( array $ch ): array {
        $stats = ['queued'=>0,'skipped'=>0,'errors'=>0];
        if ( empty($ch['import_videos']) && empty($ch['import_shorts']) ) return $stats;

        $max   = max(1, min((int)($ch['max_videos']??20), 50));
        $items = $this->api->search_videos($ch['id'], $max);
        if (!$items) return $stats;

        $ids     = array_column(array_column($items, 'id'), 'videoId');
        $details = $this->api->video_details($ids);

        foreach ($details as $yt_id => $video) {
            $iso      = $video['contentDetails']['duration'] ?? 'PT0S';
            $title    = $video['snippet']['title'] ?? '';
            $desc     = $video['snippet']['description'] ?? '';
            $is_short = PAYS_API::is_short($iso, $title, $desc);

            if ($is_short  && empty($ch['import_shorts']))  { $stats['skipped']++; continue; }
            if (!$is_short && empty($ch['import_videos']))  { $stats['skipped']++; continue; }

            $live_content = $video['snippet']['liveBroadcastContent'] ?? 'none';
            if (in_array($live_content, ['live','upcoming'], true)) { $stats['skipped']++; continue; }

            $views  = (int)($video['statistics']['viewCount'] ?? 0);
            $queued = self::enqueue($yt_id, $ch['id'], $video['snippet'], $iso, $views);
            $queued ? $stats['queued']++ : $stats['skipped']++;
        }
        return $stats;
    }

    /* ── Full sync across all channels ─────────────────────────────── */

    public static function run_sync(): array {
        $api_key  = get_option('pays_api_key', '');
        $channels = get_option('pays_channels', []);
        if (!$api_key || !$channels) return [];

        $api     = new PAYS_API($api_key);
        $self    = new self($api);
        $results = [];

        foreach ($channels as $ch) {
            if (empty($ch['enabled'])) continue;
            $results[$ch['id']] = $self->sync_channel($ch);
        }

        update_option('pays_last_sync', current_time('mysql'));
        update_option('pays_last_sync_results', $results);
        return $results;
    }

    /* ── Thumbnail helper ───────────────────────────────────────────── */

    private static function attach_thumbnail( int $post_id, string $yt_id, string $url ): void {
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $tmp = download_url($url ?: "https://img.youtube.com/vi/{$yt_id}/hqdefault.jpg");
        if (is_wp_error($tmp)) return;

        $file = ['name'=>"yt-{$yt_id}.jpg",'type'=>'image/jpeg','tmp_name'=>$tmp,'size'=>filesize($tmp)];
        $aid  = media_handle_sideload($file, $post_id);
        @unlink($tmp);
        if (!is_wp_error($aid)) set_post_thumbnail($post_id, $aid);
    }
}
