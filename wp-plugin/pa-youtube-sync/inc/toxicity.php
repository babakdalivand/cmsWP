<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Toxicity {

    private const KEYWORD_FLAGS = [
        'hate'       => ['hate','racist','sexist','slur','bigot','nazi'],
        'violence'   => ['kill','murder','bomb','terrorist','massacre','genocide'],
        'adult'      => ['porn','nude','explicit','nsfw','xxx','sex tape'],
        'spam'       => ['click here','subscribe now','100% free','make money fast','buy now'],
        'self_harm'  => ['suicide','self harm','cut yourself','overdose'],
    ];

    /**
     * Returns ['safe' => bool, 'flags' => [], 'score' => 0-100, 'source' => 'keyword|api'].
     */
    public static function analyze( string $title, string $description = '' ): array {
        $text = $title . ' ' . mb_substr( $description, 0, 2000 );

        // Try OpenAI Moderation API first (free)
        $api_key = get_option( 'pays_ai_api_key', '' );
        $provider = get_option( 'pays_ai_provider', 'openai' );

        if ( $api_key && $provider === 'openai' ) {
            $result = self::openai_moderation( $api_key, $text );
            if ( ! is_wp_error( $result ) ) return $result;
        }

        // Fallback: keyword scan
        return self::keyword_scan( $text );
    }

    /* ── OpenAI Moderation (free endpoint) ──────────────────────── */

    private static function openai_moderation( string $key, string $text ): array|\WP_Error {
        $resp = wp_remote_post( 'https://api.openai.com/v1/moderations', [
            'timeout' => 10,
            'headers' => [
                'Authorization' => "Bearer {$key}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([ 'input' => mb_substr( $text, 0, 4000 ) ]),
        ]);

        if ( is_wp_error( $resp ) ) return $resp;
        if ( wp_remote_retrieve_response_code( $resp ) !== 200 ) {
            return new \WP_Error( 'mod_api', 'Moderation API error' );
        }

        $body   = json_decode( wp_remote_retrieve_body( $resp ), true );
        $result = $body['results'][0] ?? [];

        $flagged    = (bool) ( $result['flagged'] ?? false );
        $categories = $result['categories'] ?? [];
        $scores     = $result['category_scores'] ?? [];

        $flags = array_keys( array_filter( $categories ) );
        $max_score = $scores ? max( array_values( $scores ) ) : 0;

        return [
            'safe'   => ! $flagged,
            'flags'  => $flags,
            'score'  => (int) round( $max_score * 100 ),
            'source' => 'openai',
        ];
    }

    /* ── Keyword scan ───────────────────────────────────────────── */

    private static function keyword_scan( string $text ): array {
        $text_lower = mb_strtolower( $text );
        $found      = [];

        foreach ( self::KEYWORD_FLAGS as $category => $keywords ) {
            foreach ( $keywords as $kw ) {
                if ( str_contains( $text_lower, $kw ) ) {
                    $found[] = $category;
                    break;
                }
            }
        }

        $found = array_unique( $found );

        return [
            'safe'   => empty( $found ),
            'flags'  => $found,
            'score'  => min( count( $found ) * 25, 100 ),
            'source' => 'keyword',
        ];
    }

    /* ── Custom keyword list management ─────────────────────────── */

    public static function get_custom_keywords(): array {
        return get_option( 'pays_toxicity_keywords', [] );
    }

    public static function save_custom_keywords( array $keywords ): void {
        update_option( 'pays_toxicity_keywords', array_map( 'sanitize_text_field', $keywords ) );
    }
}
