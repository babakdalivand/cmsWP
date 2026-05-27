<?php
/**
 * PAYS_Analytics — creator intelligence analytics engine
 * Stores periodic snapshots and computes trends, best times, growth, comparisons.
 */

if ( ! defined('ABSPATH') ) exit;

class PAYS_Analytics {

    private $table;
    private $queue_table;

    public function __construct() {
        global $wpdb;
        $this->table       = $wpdb->prefix . 'pays_analytics_snap';
        $this->queue_table = $wpdb->prefix . 'pays_queue';
    }

    /* ── Snapshot ───────────────────────────────────────────────────── */

    /**
     * Snapshot stats for all approved videos.
     * Called by daily cron. Reads current stats from WP post meta.
     */
    public function snapshot_all(): int {
        global $wpdb;

        $rows = $wpdb->get_results(
            "SELECT q.yt_id, q.channel_id, q.type, q.duration_sec, q.published_at, q.post_id
             FROM {$this->queue_table} q
             WHERE q.status = 'approved' AND q.post_id IS NOT NULL
             LIMIT 500",
            ARRAY_A
        );

        $saved = 0;
        foreach ( $rows as $row ) {
            $post_id = intval($row['post_id']);
            $views    = intval( get_post_meta($post_id, '_yt_views',    true) );
            $likes    = intval( get_post_meta($post_id, '_yt_likes',    true) );
            $comments = intval( get_post_meta($post_id, '_yt_comments', true) );

            if ( $views === 0 && $likes === 0 ) continue;

            $wpdb->insert(
                $this->table,
                [
                    'yt_id'        => $row['yt_id'],
                    'channel_id'   => $row['channel_id'],
                    'type'         => $row['type'],
                    'duration_sec' => intval($row['duration_sec']),
                    'published_at' => $row['published_at'],
                    'post_id'      => $post_id,
                    'views'        => $views,
                    'likes'        => $likes,
                    'comments'     => $comments,
                    'snapped_at'   => current_time('mysql'),
                ],
                ['%s','%s','%s','%d','%s','%d','%d','%d','%d','%s']
            );
            $saved++;
        }

        // Prune snapshots older than 90 days
        $wpdb->query("DELETE FROM {$this->table} WHERE snapped_at < DATE_SUB(NOW(), INTERVAL 90 DAY)");

        return $saved;
    }

    /* ── Trends ─────────────────────────────────────────────────────── */

    /**
     * Returns daily aggregate views/likes for last $days days.
     */
    public function get_channel_trends( string $channel_id = '', int $days = 30 ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';
        return $wpdb->get_results(
            "SELECT DATE(snapped_at) AS day,
                    SUM(views)    AS total_views,
                    SUM(likes)    AS total_likes,
                    SUM(comments) AS total_comments,
                    COUNT(DISTINCT yt_id) AS video_count
             FROM {$this->table}
             WHERE snapped_at >= DATE_SUB(NOW(), INTERVAL {$days} DAY) {$where}
             GROUP BY DATE(snapped_at)
             ORDER BY day ASC",
            ARRAY_A
        );
    }

    /* ── Best Upload Time ───────────────────────────────────────────── */

    /**
     * Returns average views per (weekday, hour) slot of the published_at time.
     */
    public function get_best_upload_times( string $channel_id = '' ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';

        // Take the most recent snapshot per video for a stable view count
        $rows = $wpdb->get_results(
            "SELECT yt_id, published_at, MAX(views) AS peak_views, type
             FROM {$this->table}
             WHERE published_at IS NOT NULL {$where}
             GROUP BY yt_id",
            ARRAY_A
        );

        $slots = [];
        foreach ( $rows as $r ) {
            if ( empty($r['published_at']) ) continue;
            $ts  = strtotime($r['published_at']);
            $dow = (int) date('N', $ts); // 1=Mon … 7=Sun
            $hr  = (int) date('G', $ts); // 0-23

            $key = "{$dow}_{$hr}";
            if ( ! isset($slots[$key]) ) {
                $slots[$key] = [ 'dow' => $dow, 'hour' => $hr, 'views' => [], 'count' => 0 ];
            }
            $slots[$key]['views'][] = intval($r['peak_views']);
            $slots[$key]['count']++;
        }

        $result = [];
        foreach ( $slots as $s ) {
            $result[] = [
                'dow'        => $s['dow'],
                'hour'       => $s['hour'],
                'avg_views'  => count($s['views']) ? intval(array_sum($s['views']) / count($s['views'])) : 0,
                'count'      => $s['count'],
            ];
        }

        usort($result, fn($a, $b) => $b['avg_views'] - $a['avg_views']);
        return $result;
    }

    /* ── Shorts vs Long-form ────────────────────────────────────────── */

    public function get_format_comparison( string $channel_id = '' ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';

        return $wpdb->get_results(
            "SELECT type,
                    COUNT(DISTINCT yt_id)          AS video_count,
                    AVG(views)                     AS avg_views,
                    AVG(likes)                     AS avg_likes,
                    AVG(comments)                  AS avg_comments,
                    ROUND(AVG(CASE WHEN views > 0 THEN likes/views*100 ELSE 0 END),2) AS avg_like_rate,
                    AVG(duration_sec)              AS avg_duration
             FROM {$this->table}
             WHERE 1=1 {$where}
             GROUP BY type",
            ARRAY_A
        );
    }

    /* ── Playlist Performance ───────────────────────────────────────── */

    public function get_playlist_performance(): array {
        global $wpdb;

        // WP videos with series taxonomy get_terms
        $series = get_terms(['taxonomy' => 'pa_series', 'hide_empty' => true, 'number' => 20]);
        if ( is_wp_error($series) || empty($series) ) return [];

        $result = [];
        foreach ( $series as $term ) {
            $posts = get_posts([
                'post_type'      => 'pa_video',
                'posts_per_page' => -1,
                'tax_query'      => [['taxonomy' => 'pa_series', 'field' => 'term_id', 'terms' => $term->term_id]],
                'fields'         => 'ids',
            ]);

            if ( empty($posts) ) continue;

            $total_views    = 0;
            $total_likes    = 0;
            $total_comments = 0;
            foreach ( $posts as $pid ) {
                $total_views    += intval( get_post_meta($pid, '_yt_views',    true) );
                $total_likes    += intval( get_post_meta($pid, '_yt_likes',    true) );
                $total_comments += intval( get_post_meta($pid, '_yt_comments', true) );
            }

            $count = count($posts);
            $result[] = [
                'playlist_id'   => $term->term_id,
                'name'          => $term->name,
                'video_count'   => $count,
                'total_views'   => $total_views,
                'total_likes'   => $total_likes,
                'total_comments'=> $total_comments,
                'avg_views'     => $count ? intval($total_views / $count) : 0,
                'avg_like_rate' => $total_views ? round($total_likes / $total_views * 100, 2) : 0,
            ];
        }

        usort($result, fn($a, $b) => $b['total_views'] - $a['total_views']);
        return $result;
    }

    /* ── Growth Prediction ──────────────────────────────────────────── */

    /**
     * Simple linear regression on weekly aggregate views.
     * Returns past 8 weeks + 4 week forecast.
     */
    public function get_growth_prediction( string $channel_id = '' ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';

        $weeks = $wpdb->get_results(
            "SELECT YEARWEEK(snapped_at, 3) AS yw,
                    MIN(DATE(snapped_at))   AS week_start,
                    SUM(views)              AS total_views,
                    COUNT(DISTINCT yt_id)   AS videos
             FROM {$this->table}
             WHERE snapped_at >= DATE_SUB(NOW(), INTERVAL 56 DAY) {$where}
             GROUP BY YEARWEEK(snapped_at, 3)
             ORDER BY yw ASC",
            ARRAY_A
        );

        if ( count($weeks) < 2 ) return [ 'history' => $weeks, 'forecast' => [] ];

        // Linear regression on views
        $n  = count($weeks);
        $xs = range(1, $n);
        $ys = array_column($weeks, 'total_views');

        $sx  = array_sum($xs);
        $sy  = array_sum($ys);
        $sxx = array_sum(array_map(fn($x) => $x * $x, $xs));
        $sxy = array_sum(array_map(fn($i) => $xs[$i] * $ys[$i], array_keys($xs)));

        $denom = $n * $sxx - $sx * $sx;
        if ( $denom == 0 ) return [ 'history' => $weeks, 'forecast' => [] ];

        $slope     = ($n * $sxy - $sx * $sy) / $denom;
        $intercept = ($sy - $slope * $sx) / $n;

        $last_date = strtotime(end($weeks)['week_start']);
        $forecast  = [];
        for ( $i = 1; $i <= 4; $i++ ) {
            $predicted = max(0, intval($intercept + $slope * ($n + $i)));
            $forecast[] = [
                'week_start'   => date('Y-m-d', strtotime("+{$i} weeks", $last_date)),
                'predicted_views' => $predicted,
                'is_forecast'  => true,
            ];
        }

        return [
            'history'   => $weeks,
            'forecast'  => $forecast,
            'slope'     => round($slope, 2),
            'trend'     => $slope > 0 ? 'growing' : ($slope < -10 ? 'declining' : 'stable'),
        ];
    }

    /* ── Top Performers ─────────────────────────────────────────────── */

    public function get_top_performers( string $channel_id = '', int $limit = 10 ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND s.channel_id = %s", $channel_id) : '';

        return $wpdb->get_results(
            "SELECT s.yt_id, s.type, s.published_at, MAX(s.views) AS peak_views,
                    MAX(s.likes) AS peak_likes, MAX(s.comments) AS peak_comments,
                    q.title, q.thumbnail,
                    ROUND(MAX(s.likes) / NULLIF(MAX(s.views),0) * 100, 2) AS like_rate
             FROM {$this->table} s
             JOIN {$this->queue_table} q ON q.yt_id = s.yt_id
             WHERE 1=1 {$where}
             GROUP BY s.yt_id
             ORDER BY peak_views DESC
             LIMIT {$limit}",
            ARRAY_A
        );
    }

    /* ── Engagement Stats ───────────────────────────────────────────── */

    public function get_engagement_summary( string $channel_id = '' ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';

        $row = $wpdb->get_row(
            "SELECT COUNT(DISTINCT yt_id)          AS total_videos,
                    SUM(views)                     AS total_views,
                    SUM(likes)                     AS total_likes,
                    SUM(comments)                  AS total_comments,
                    ROUND(AVG(views), 0)            AS avg_views,
                    ROUND(AVG(CASE WHEN views > 0 THEN likes/views*100 ELSE 0 END), 2) AS avg_like_rate,
                    MAX(views)                     AS max_views,
                    MIN(snapped_at)                AS first_snap,
                    MAX(snapped_at)                AS last_snap
             FROM {$this->table}
             WHERE 1=1 {$where}",
            ARRAY_A
        );

        return $row ?: [];
    }

    /* ── Weekly Report ──────────────────────────────────────────────── */

    public function get_weekly_report( string $channel_id = '' ): array {
        global $wpdb;

        $where = $channel_id ? $wpdb->prepare("AND channel_id = %s", $channel_id) : '';

        $this_week = $wpdb->get_row(
            "SELECT SUM(views) AS views, SUM(likes) AS likes,
                    SUM(comments) AS comments, COUNT(DISTINCT yt_id) AS videos
             FROM {$this->table}
             WHERE snapped_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) {$where}",
            ARRAY_A
        );

        $last_week = $wpdb->get_row(
            "SELECT SUM(views) AS views, SUM(likes) AS likes,
                    SUM(comments) AS comments, COUNT(DISTINCT yt_id) AS videos
             FROM {$this->table}
             WHERE snapped_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
               AND snapped_at < DATE_SUB(NOW(), INTERVAL 7 DAY) {$where}",
            ARRAY_A
        );

        $delta = function($curr, $prev) {
            if ( ! $prev || $prev == 0 ) return null;
            return round(($curr - $prev) / $prev * 100, 1);
        };

        return [
            'this_week' => $this_week,
            'last_week' => $last_week,
            'deltas'    => [
                'views'    => $delta($this_week['views']    ?? 0, $last_week['views']    ?? 0),
                'likes'    => $delta($this_week['likes']    ?? 0, $last_week['likes']    ?? 0),
                'comments' => $delta($this_week['comments'] ?? 0, $last_week['comments'] ?? 0),
            ],
            'generated_at' => current_time('mysql'),
        ];
    }
}

/* ── Cron hook to snapshot stats daily ─────────────────────────── */
add_action('pays_analytics_snapshot', function() {
    $a = new PAYS_Analytics();
    $a->snapshot_all();
});

if ( ! wp_next_scheduled('pays_analytics_snapshot') ) {
    wp_schedule_event(time(), 'daily', 'pays_analytics_snapshot');
}
