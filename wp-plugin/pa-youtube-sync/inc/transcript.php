<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Transcript {

    /* -------------------------------------------------------
       Public API
    ------------------------------------------------------- */

    public static function fetch( string $yt_id, string $lang = 'en', bool $force = false ): array {
        if ( ! $force ) {
            $cached = self::get( $yt_id, $lang );
            if ( $cached && ! empty( $cached['raw_text'] ) ) return $cached;
        }

        $transcript = self::fetch_timedtext( $yt_id, $lang );

        if ( empty( $transcript['raw_text'] ) && $lang !== 'en' ) {
            $transcript = self::fetch_timedtext( $yt_id, 'en' );
        }

        if ( ! empty( $transcript['raw_text'] ) ) {
            self::save( $yt_id, $transcript['language'], $transcript );
        }

        return $transcript;
    }

    public static function save( string $yt_id, string $lang, array $data ): bool {
        global $wpdb;
        return (bool) $wpdb->replace(
            $wpdb->prefix . 'pays_transcripts',
            [
                'yt_id'      => $yt_id,
                'language'   => $lang,
                'source'     => $data['source']     ?? 'auto',
                'raw_text'   => $data['raw_text']   ?? '',
                'timed_json' => $data['timed_json'] ?? '[]',
                'word_count' => $data['word_count'] ?? 0,
                'fetched_at' => current_time('mysql'),
            ]
        );
    }

    public static function get( string $yt_id, string $lang ): ?array {
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}pays_transcripts WHERE yt_id = %s AND language = %s",
                $yt_id, $lang
            ),
            ARRAY_A
        );
        return $row ?: null;
    }

    public static function search( string $query, int $limit = 20 ): array {
        global $wpdb;
        $t = $wpdb->prefix . 'pays_transcripts';
        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT yt_id, language, word_count,
                 MATCH(raw_text) AGAINST(%s IN NATURAL LANGUAGE MODE) AS relevance
                 FROM $t
                 WHERE MATCH(raw_text) AGAINST(%s IN NATURAL LANGUAGE MODE)
                 ORDER BY relevance DESC LIMIT %d",
                $query, $query, $limit
            ),
            ARRAY_A
        );
    }

    public static function delete( string $yt_id ): void {
        global $wpdb;
        $wpdb->delete( $wpdb->prefix . 'pays_transcripts', [ 'yt_id' => $yt_id ] );
    }

    /* -------------------------------------------------------
       Private: fetchers
    ------------------------------------------------------- */

    private static function fetch_timedtext( string $yt_id, string $lang ): array {
        $urls = [
            "https://www.youtube.com/api/timedtext?lang={$lang}&v={$yt_id}&fmt=json3",
            "https://www.youtube.com/api/timedtext?lang={$lang}&v={$yt_id}&fmt=json3&kind=asr",
        ];

        foreach ( $urls as $url ) {
            $resp = wp_remote_get( $url, [
                'timeout' => 20,
                'headers' => [ 'User-Agent' => 'Mozilla/5.0' ],
            ]);
            if ( is_wp_error( $resp ) ) continue;
            if ( wp_remote_retrieve_response_code( $resp ) !== 200 ) continue;

            $data = json_decode( wp_remote_retrieve_body( $resp ), true );
            if ( ! empty( $data['events'] ) ) {
                return self::parse_json3( $data, $lang );
            }
        }

        return self::fetch_xml( $yt_id, $lang );
    }

    private static function fetch_xml( string $yt_id, string $lang ): array {
        $url  = "https://www.youtube.com/api/timedtext?lang={$lang}&v={$yt_id}";
        $resp = wp_remote_get( $url, [ 'timeout' => 20 ] );

        if ( is_wp_error( $resp ) || wp_remote_retrieve_response_code( $resp ) !== 200 ) {
            return [];
        }

        $xml_str = wp_remote_retrieve_body( $resp );
        if ( empty( $xml_str ) || strpos( $xml_str, '<text' ) === false ) return [];

        libxml_use_internal_errors( true );
        $xml = simplexml_load_string( $xml_str );
        if ( ! $xml ) return [];

        $segments  = [];
        $raw_parts = [];

        foreach ( $xml->text as $node ) {
            $text = html_entity_decode( (string) $node, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
            $text = trim( $text );
            if ( ! $text ) continue;
            $segments[]  = [
                'start' => (float) ( $node['start'] ?? 0 ),
                'dur'   => (float) ( $node['dur']   ?? 0 ),
                'text'  => $text,
            ];
            $raw_parts[] = $text;
        }

        if ( empty( $segments ) ) return [];

        return [
            'language'   => $lang,
            'source'     => 'auto',
            'raw_text'   => implode( ' ', $raw_parts ),
            'timed_json' => wp_json_encode( $segments ),
            'word_count' => str_word_count( implode( ' ', $raw_parts ) ),
        ];
    }

    private static function parse_json3( array $data, string $lang ): array {
        $segments  = [];
        $raw_parts = [];

        foreach ( $data['events'] as $event ) {
            if ( empty( $event['segs'] ) ) continue;
            $text = '';
            foreach ( $event['segs'] as $seg ) {
                $text .= $seg['utf8'] ?? '';
            }
            $text = trim( $text );
            if ( ! $text ) continue;
            $segments[]  = [
                'start' => round( ( $event['tStartMs']    ?? 0 ) / 1000, 2 ),
                'dur'   => round( ( $event['dDurationMs'] ?? 0 ) / 1000, 2 ),
                'text'  => $text,
            ];
            $raw_parts[] = $text;
        }

        if ( empty( $segments ) ) return [];

        return [
            'language'   => $lang,
            'source'     => 'auto',
            'raw_text'   => implode( ' ', $raw_parts ),
            'timed_json' => wp_json_encode( $segments ),
            'word_count' => str_word_count( implode( ' ', $raw_parts ) ),
        ];
    }
}
