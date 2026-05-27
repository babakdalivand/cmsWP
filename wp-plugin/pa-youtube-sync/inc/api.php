<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_API {

    private string $key;
    private string $base = 'https://www.googleapis.com/youtube/v3/';

    public function __construct( string $key ) { $this->key = $key; }

    private function get( string $ep, array $p ): ?array {
        $p['key'] = $this->key;
        $r = wp_remote_get( $this->base . $ep . '?' . http_build_query($p), ['timeout' => 20] );
        if ( is_wp_error($r) ) return null;
        $b = json_decode( wp_remote_retrieve_body($r), true );
        return isset($b['error']) ? null : $b;
    }

    /* ── Channel ──────────────────────────────────────────────────────── */

    public function resolve_channel( string $input ): ?string {
        $input = trim($input);
        if ( preg_match('/^UC[\w-]{22}$/', $input) ) return $input;
        if ( preg_match('#youtube\.com/channel/(UC[\w-]{22})#', $input, $m) ) return $m[1];
        if ( preg_match('#youtube\.com/@([\w.-]+)#', $input, $m) ||
             preg_match('#youtube\.com/(?:user|c)/([\w.-]+)#', $input, $m) ) {
            $d = $this->get('search', ['part'=>'snippet','q'=>$m[1],'type'=>'channel','maxResults'=>1]);
            return $d['items'][0]['snippet']['channelId'] ?? null;
        }
        $d = $this->get('channels', ['part'=>'id','id'=>$input]);
        return $d['items'][0]['id'] ?? null;
    }

    public function channel_info( string $id ): ?array {
        $d = $this->get('channels', ['part'=>'snippet,statistics','id'=>$id]);
        $i = $d['items'][0] ?? null;
        if (!$i) return null;
        return [
            'id'           => $id,
            'name'         => $i['snippet']['title'],
            'thumbnail'    => $i['snippet']['thumbnails']['default']['url'] ?? '',
            'subscribers'  => (int)($i['statistics']['subscriberCount'] ?? 0),
            'video_count'  => (int)($i['statistics']['videoCount']     ?? 0),
        ];
    }

    /* ── Search ───────────────────────────────────────────────────────── */

    public function search_videos( string $ch_id, int $max = 50, string $event = '' ): array {
        $p = ['part'=>'snippet','channelId'=>$ch_id,'type'=>'video','order'=>'date','maxResults'=>min($max,50)];
        if ( $event ) $p['eventType'] = $event;
        return $this->get('search', $p)['items'] ?? [];
    }

    /* ── Video details (batch up to 50) ──────────────────────────────── */

    public function video_details( array $ids ): array {
        if (!$ids) return [];
        $d = $this->get('videos', [
            'part' => 'snippet,contentDetails,statistics',
            'id'   => implode(',', array_slice($ids, 0, 50)),
        ]);
        $out = [];
        foreach ( ($d['items'] ?? []) as $item ) $out[$item['id']] = $item;
        return $out;
    }

    /* ── Playlists ────────────────────────────────────────────────────── */

    public function channel_playlists( string $ch_id, int $max = 20 ): array {
        $d = $this->get('playlists', [
            'part'       => 'snippet,contentDetails',
            'channelId'  => $ch_id,
            'maxResults' => $max,
        ]);
        return $d['items'] ?? [];
    }

    public function playlist_videos( string $pl_id, int $max = 50 ): array {
        $items = [];
        $token = null;
        while ( count($items) < $max ) {
            $p = ['part'=>'snippet','playlistId'=>$pl_id,'maxResults'=>min(50,$max-count($items))];
            if ($token) $p['pageToken'] = $token;
            $d = $this->get('playlistItems', $p);
            if (!$d) break;
            $items = array_merge($items, $d['items'] ?? []);
            $token = $d['nextPageToken'] ?? null;
            if (!$token) break;
        }
        return $items;
    }

    /* ── Live ─────────────────────────────────────────────────────────── */

    public function live_streams( string $ch_id ): array {
        return [
            'live'     => $this->search_videos($ch_id, 5, 'live'),
            'upcoming' => $this->search_videos($ch_id, 5, 'upcoming'),
        ];
    }

    /* ── Analytics (basic — uses YouTube Data API quota) ─────────────── */

    public function video_stats( array $ids ): array {
        if (!$ids) return [];
        $d = $this->get('videos', [
            'part' => 'statistics,snippet',
            'id'   => implode(',', array_slice($ids, 0, 50)),
        ]);
        $out = [];
        foreach ( ($d['items'] ?? []) as $item ) {
            $out[$item['id']] = [
                'title'     => $item['snippet']['title'],
                'views'     => (int)($item['statistics']['viewCount']    ?? 0),
                'likes'     => (int)($item['statistics']['likeCount']    ?? 0),
                'comments'  => (int)($item['statistics']['commentCount'] ?? 0),
            ];
        }
        return $out;
    }

    /* ── Live channel analytics from YouTube API directly ───────────── */

    public function live_channel_stats( string $channel_id ): array {
        $ch_data = $this->get('channels', [
            'part' => 'snippet,statistics',
            'id'   => $channel_id,
        ]);
        $ch = $ch_data['items'][0] ?? null;
        if ( !$ch ) return ['error' => 'Channel not found'];

        $channel = [
            'id'          => $channel_id,
            'name'        => $ch['snippet']['title'],
            'thumbnail'   => $ch['snippet']['thumbnails']['default']['url'] ?? '',
            'subscribers' => (int)($ch['statistics']['subscriberCount'] ?? 0),
            'total_views' => (int)($ch['statistics']['viewCount']       ?? 0),
            'video_count' => (int)($ch['statistics']['videoCount']      ?? 0),
        ];

        $search = $this->get('search', [
            'part'       => 'id',
            'channelId'  => $channel_id,
            'type'       => 'video',
            'order'      => 'viewCount',
            'maxResults' => 50,
        ]);
        $ids = array_map(fn($i) => $i['id']['videoId'], $search['items'] ?? []);

        $videos = [];
        if ( $ids ) {
            $details = $this->video_details($ids);
            foreach ( $details as $yt_id => $v ) {
                $views    = (int)($v['statistics']['viewCount']    ?? 0);
                $likes    = (int)($v['statistics']['likeCount']    ?? 0);
                $comments = (int)($v['statistics']['commentCount'] ?? 0);
                $dur      = $v['contentDetails']['duration'] ?? 'PT0S';
                $videos[] = [
                    'yt_id'        => $yt_id,
                    'title'        => $v['snippet']['title'],
                    'thumbnail'    => $v['snippet']['thumbnails']['medium']['url'] ?? '',
                    'published_at' => $v['snippet']['publishedAt'] ?? '',
                    'views'        => $views,
                    'likes'        => $likes,
                    'comments'     => $comments,
                    'like_rate'    => $views > 0 ? round($likes / $views * 100, 2) : 0,
                    'duration_sec' => self::duration_seconds($dur),
                    'type'         => self::is_short($dur, $v['snippet']['title']) ? 'short' : 'video',
                ];
            }
            usort($videos, fn($a, $b) => $b['views'] - $a['views']);
        }

        $total_v      = count($videos);
        $sum_views    = array_sum(array_column($videos, 'views'));
        $sum_likes    = array_sum(array_column($videos, 'likes'));
        $sum_comments = array_sum(array_column($videos, 'comments'));

        return [
            'channel' => $channel,
            'summary' => [
                'total_videos'   => $total_v,
                'total_views'    => $sum_views,
                'total_likes'    => $sum_likes,
                'total_comments' => $sum_comments,
                'avg_views'      => $total_v ? (int)round($sum_views / $total_v) : 0,
                'avg_likes'      => $total_v ? (int)round($sum_likes / $total_v) : 0,
                'like_rate'      => $sum_views > 0 ? round($sum_likes / $sum_views * 100, 2) : 0,
            ],
            'top' => array_slice($videos, 0, 10),
        ];
    }

    /* ── Helpers ──────────────────────────────────────────────────────── */

    public static function duration_seconds( string $iso ): int {
        preg_match('/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/', $iso, $m);
        return (int)($m[1]??0)*3600 + (int)($m[2]??0)*60 + (int)($m[3]??0);
    }

    public static function format_duration( int $s ): string {
        $h = floor($s/3600); $m = floor(($s%3600)/60); $sec = $s%60;
        return $h ? sprintf('%d:%02d:%02d',$h,$m,$sec) : sprintf('%d:%02d',$m,$sec);
    }

    public static function is_short( string $iso, string $title = '', string $description = '' ): bool {
        $sec = self::duration_seconds($iso);
        return $sec > 0 && $sec <= 180;
    }

    public static function shorts_playlist_id( string $channel_id ): string {
        return 'UUSH' . substr( $channel_id, 2 );
    }

    public function get_shorts_ids( string $channel_id, int $max = 200 ): array {
        $pl_id = self::shorts_playlist_id( $channel_id );
        $ids   = [];
        $token = null;
        while ( count($ids) < $max ) {
            $p = [
                'part'       => 'contentDetails',
                'playlistId' => $pl_id,
                'maxResults' => min(50, $max - count($ids)),
            ];
            if ( $token ) $p['pageToken'] = $token;
            $d = $this->get('playlistItems', $p);
            if ( empty($d['items']) ) break;
            foreach ( $d['items'] as $item ) {
                $ids[] = $item['contentDetails']['videoId'];
            }
            $token = $d['nextPageToken'] ?? null;
            if ( !$token ) break;
        }
        return $ids;
    }
}
