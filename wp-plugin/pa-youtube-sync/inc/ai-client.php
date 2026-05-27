<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * Shared AI API caller used by both PAYS_AI_SEO and PAYS_Article_Generator.
 */
class PAYS_AI_Client {

    public static function call( string $prompt ): array|\WP_Error {
        $provider = get_option( 'pays_ai_provider', 'openai' );
        $api_key  = get_option( 'pays_ai_api_key',  '' );
        $model    = get_option( 'pays_ai_model',    '' );

        if ( empty( $api_key ) ) {
            return new \WP_Error( 'no_api_key', 'AI API key not configured.' );
        }

        return $provider === 'claude'
            ? self::claude(  $api_key, $model, $prompt )
            : self::openai( $api_key, $model, $prompt );
    }

    public static function openai( string $key, string $model, string $prompt ): array|\WP_Error {
        $resp = wp_remote_post( 'https://api.openai.com/v1/chat/completions', [
            'timeout' => 90,
            'headers' => [
                'Authorization' => "Bearer {$key}",
                'Content-Type'  => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'           => $model ?: 'gpt-4o-mini',
                'messages'        => [
                    [ 'role' => 'system', 'content' => 'You are an expert content writer. Respond with valid JSON only.' ],
                    [ 'role' => 'user',   'content' => $prompt ],
                ],
                'temperature'     => 0.75,
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

    public static function claude( string $key, string $model, string $prompt ): array|\WP_Error {
        $resp = wp_remote_post( 'https://api.anthropic.com/v1/messages', [
            'timeout' => 90,
            'headers' => [
                'x-api-key'         => $key,
                'anthropic-version' => '2023-06-01',
                'Content-Type'      => 'application/json',
            ],
            'body' => wp_json_encode([
                'model'      => $model ?: 'claude-haiku-4-5-20251001',
                'max_tokens' => 4096,
                'system'     => 'You are an expert content writer. Respond with valid JSON only.',
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

    public static function parse_json( string $content ): array {
        $content = preg_replace( '/^```json\s*/m', '', $content );
        $content = preg_replace( '/^```\s*/m',     '', $content );
        $data    = json_decode( trim( $content ), true );
        return is_array( $data ) ? $data : [];
    }
}
