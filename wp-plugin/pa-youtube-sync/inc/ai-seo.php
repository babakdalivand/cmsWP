<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_AI_SEO {

    /* -------------------------------------------------------
       Generate & persist
    ------------------------------------------------------- */

    public static function generate( int $post_id, string $yt_id, string $lang = 'en' ): array|\WP_Error {
        $provider = get_option( 'pays_ai_provider', 'openai' );
        $api_key  = get_option( 'pays_ai_api_key',  '' );
        $model    = get_option( 'pays_ai_model',    '' );

        if ( empty( $api_key ) ) {
            return new \WP_Error( 'no_api_key', 'AI API key not configured.' );
        }

        // Ensure transcript exists
        $transcript = PAYS_Transcript::get( $yt_id, $lang );
        if ( empty( $transcript['raw_text'] ) ) {
            $transcript = PAYS_Transcript::fetch( $yt_id, $lang );
        }

        $post  = get_post( $post_id );
        $title = $post ? $post->post_title : '';
        $text  = $transcript['raw_text'] ?? '';

        // Stay within token limits (≈ 12 000 chars ≈ 3 000 tokens)
        if ( mb_strlen( $text ) > 12000 ) {
            $text = mb_substr( $text, 0, 12000 ) . '…';
        }

        $prompt = self::build_prompt( $title, $text, $lang );

        $result = ( $provider === 'claude' )
            ? self::call_claude(  $api_key, $model, $prompt )
            : self::call_openai( $api_key, $model, $prompt );

        if ( is_wp_error( $result ) ) return $result;

        $ai_data = self::parse_response( $result['content'] );
        $ai_data['ai_provider']        = $provider;
        $ai_data['model']              = $model;
        $ai_data['prompt_tokens']      = $result['usage']['prompt_tokens']      ?? 0;
        $ai_data['completion_tokens']  = $result['usage']['completion_tokens']  ?? 0;
        $ai_data['schema_json']        = PAYS_Schema::generate( $post_id, $yt_id );

        self::save( $post_id, $yt_id, $lang, $ai_data );

        return $ai_data;
    }

    public static function save( int $post_id, string $yt_id, string $lang, array $d ): bool {
        global $wpdb;
        return (bool) $wpdb->replace(
            $wpdb->prefix . 'pays_ai_content',
            [
                'post_id'           => $post_id,
                'yt_id'             => $yt_id,
                'language'          => $lang,
                'seo_title'         => $d['seo_title']        ?? '',
                'meta_description'  => $d['meta_description'] ?? '',
                'excerpt'           => $d['excerpt']          ?? '',
                'tags'              => $d['tags']             ?? '',
                'faq_schema'        => $d['faq_schema']       ?? '[]',
                'article_content'   => $d['article_content']  ?? '',
                'schema_json'       => $d['schema_json']      ?? '{}',
                'ai_provider'       => $d['ai_provider']      ?? '',
                'model'             => $d['model']            ?? '',
                'prompt_tokens'     => $d['prompt_tokens']    ?? 0,
                'completion_tokens' => $d['completion_tokens'] ?? 0,
                'generated_at'      => current_time('mysql'),
            ]
        );
    }

    public static function get( int $post_id, string $lang = 'en' ): ?array {
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}pays_ai_content WHERE post_id = %d AND language = %s",
                $post_id, $lang
            ),
            ARRAY_A
        );
        return $row ?: null;
    }

    public static function apply_to_post( int $post_id, array $d ): bool {
        $update = [ 'ID' => $post_id ];

        if ( ! empty( $d['seo_title'] ) )      $update['post_title']   = sanitize_text_field( $d['seo_title'] );
        if ( ! empty( $d['excerpt'] ) )         $update['post_excerpt'] = sanitize_textarea_field( $d['excerpt'] );
        if ( ! empty( $d['article_content'] ) ) $update['post_content'] = wp_kses_post( $d['article_content'] );

        if ( count( $update ) > 1 ) wp_update_post( $update );

        if ( ! empty( $d['meta_description'] ) ) {
            update_post_meta( $post_id, '_pays_meta_description', sanitize_textarea_field( $d['meta_description'] ) );
        }
        if ( ! empty( $d['tags'] ) ) {
            $tags = array_map( 'trim', explode( ',', $d['tags'] ) );
            wp_set_post_tags( $post_id, $tags, false );
        }

        return true;
    }

    /* -------------------------------------------------------
       Prompt builder
    ------------------------------------------------------- */

    private static function build_prompt( string $title, string $transcript, string $lang ): string {
        $lang_name = $lang === 'fa' ? 'Persian (Farsi)' : 'English';
        $src = $transcript
            ? "Based on the following video transcript:\n\n---\n{$transcript}\n---"
            : "Based on the video title: \"{$title}\"";

        return <<<PROMPT
You are an expert SEO content writer specializing in {$lang_name} content.
{$src}

Video title: "{$title}"

Generate SEO-optimized content in **{$lang_name}** only.
Return ONLY valid JSON with exactly these keys:

{
  "seo_title": "SEO-optimized title, max 60 chars",
  "meta_description": "Compelling meta description, 150-160 chars",
  "excerpt": "2-3 sentence summary",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "faq_schema": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ],
  "article_content": "Full article in markdown, 300-500 words"
}

Rules:
- All text in {$lang_name} only
- tags: 5-10 relevant keywords as array
- faq_schema: 3-5 Q&A pairs
- article_content: use ## headings, no placeholder text
PROMPT;
    }

    /* -------------------------------------------------------
       API callers
    ------------------------------------------------------- */

    private static function call_openai( string $key, string $model, string $prompt ): array|\WP_Error {
        $resp = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
            'timeout' => 90,
            'headers' => [
                'Authorization' => "Bearer {$key}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'           => $model ?: 'gpt-4o-mini',
                'messages'        => [
                    [ 'role' => 'system', 'content' => 'You are an SEO expert. Respond with valid JSON only.' ],
                    [ 'role' => 'user',   'content' => $prompt ],
                ],
                'temperature'     => 0.7,
                'response_format' => [ 'type' => 'json_object' ],
            ]),
        ]);

        if ( is_wp_error( $resp ) ) return $resp;

        $body = json_decode( wp_remote_retrieve_body( $resp ), true );
        $code = wp_remote_retrieve_response_code( $resp );

        if ( $code !== 200 ) {
            return new \WP_Error( 'openai_error', $body['error']['message'] ?? "OpenAI HTTP {$code}" );
        }

        return [
            'content' => $body['choices'][0]['message']['content'] ?? '',
            'usage'   => $body['usage'] ?? [],
        ];
    }

    private static function call_claude( string $key, string $model, string $prompt ): array|\WP_Error {
        $resp = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
            'timeout' => 90,
            'headers' => [
                'x-api-key'         => $key,
                'anthropic-version' => '2023-06-01',
                'Content-Type'      => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'      => $model ?: 'claude-haiku-4-5-20251001',
                'max_tokens' => 2048,
                'system'     => 'You are an SEO expert. Respond with valid JSON only.',
                'messages'   => [ [ 'role' => 'user', 'content' => $prompt ] ],
            ]),
        ]);

        if ( is_wp_error( $resp ) ) return $resp;

        $body = json_decode( wp_remote_retrieve_body( $resp ), true );
        $code = wp_remote_retrieve_response_code( $resp );

        if ( $code !== 200 ) {
            return new \WP_Error( 'claude_error', $body['error']['message'] ?? "Claude HTTP {$code}" );
        }

        return [
            'content' => $body['content'][0]['text'] ?? '',
            'usage'   => [
                'prompt_tokens'     => $body['usage']['input_tokens']  ?? 0,
                'completion_tokens' => $body['usage']['output_tokens'] ?? 0,
            ],
        ];
    }

    /* -------------------------------------------------------
       Response parser
    ------------------------------------------------------- */

    private static function parse_response( string $content ): array {
        $content = preg_replace( '/^```json\s*/m', '', $content );
        $content = preg_replace( '/^```\s*/m',     '', $content );
        $content = trim( $content );

        $d = json_decode( $content, true );
        if ( ! is_array( $d ) ) $d = [];

        return [
            'seo_title'       => $d['seo_title']        ?? '',
            'meta_description'=> $d['meta_description'] ?? '',
            'excerpt'         => $d['excerpt']          ?? '',
            'tags'            => is_array( $d['tags'] ) ? implode( ',', $d['tags'] ) : ( $d['tags'] ?? '' ),
            'faq_schema'      => wp_json_encode( $d['faq_schema'] ?? [] ),
            'article_content' => $d['article_content']  ?? '',
        ];
    }
}
