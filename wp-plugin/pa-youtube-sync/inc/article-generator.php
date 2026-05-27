<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Article_Generator {

    const TONES = [
        'formal'      => 'formal and authoritative, using proper academic prose',
        'podcast'     => 'conversational and engaging, like a podcast host talking to listeners',
        'news'        => 'journalistic news style — concise, factual, inverted pyramid',
        'educational' => 'educational and accessible, with clear explanations and examples',
    ];

    /* -------------------------------------------------------
       Main entry point
    ------------------------------------------------------- */

    public static function generate(
        int    $post_id,
        string $yt_id,
        string $lang  = 'en',
        string $tone  = 'formal'
    ): array|\WP_Error {

        // Ensure transcript
        $transcript = PAYS_Transcript::get( $yt_id, $lang );
        if ( empty( $transcript['raw_text'] ) ) {
            $transcript = PAYS_Transcript::fetch( $yt_id, $lang );
        }
        if ( empty( $transcript['raw_text'] ) ) {
            return new \WP_Error( 'no_transcript', 'No transcript available for this video.' );
        }

        $post = get_post( $post_id );
        if ( ! $post ) return new \WP_Error( 'post_not_found', 'Post not found.' );

        // AI generation
        $article = self::ai_generate( $post->post_title, $transcript['raw_text'], $lang, $tone );
        if ( is_wp_error( $article ) ) return $article;

        // Internal link suggestions
        $article['link_suggestions'] = PAYS_Internal_Links::suggest( $article['body_text'] ?? '', 5 );

        // Build Gutenberg blocks
        $blocks = PAYS_Gutenberg::from_article_data( $article, $lang );

        // Update post as draft
        $update = [
            'ID'           => $post_id,
            'post_content' => $blocks,
            'post_excerpt' => sanitize_textarea_field( $article['excerpt'] ?? '' ),
            'post_status'  => 'draft',
        ];
        if ( ! empty( $article['title'] ) ) {
            $update['post_title'] = sanitize_text_field( $article['title'] );
        }
        wp_update_post( $update );

        // Featured image from YouTube thumbnail
        PAYS_Featured_Image::set_from_youtube( $post_id, $yt_id );

        // Tags
        if ( ! empty( $article['tags'] ) ) {
            wp_set_post_tags( $post_id, (array) $article['tags'], false );
        }

        // Metadata
        update_post_meta( $post_id, '_pays_article_tone',        $tone );
        update_post_meta( $post_id, '_pays_article_lang',        $lang );
        update_post_meta( $post_id, '_pays_article_generated',   current_time('mysql') );
        update_post_meta( $post_id, '_pays_link_suggestions',    $article['link_suggestions'] );
        update_post_meta( $post_id, '_pays_key_timestamps',      $article['key_timestamps'] ?? [] );

        return [
            'post_id'          => $post_id,
            'tone'             => $tone,
            'lang'             => $lang,
            'sections'         => count( $article['sections'] ?? [] ),
            'word_count'       => str_word_count( $article['body_text'] ?? '' ),
            'link_suggestions' => $article['link_suggestions'],
            'edit_url'         => get_edit_post_link( $post_id, 'raw' ),
        ];
    }

    /* -------------------------------------------------------
       AI prompt & call
    ------------------------------------------------------- */

    private static function ai_generate(
        string $title,
        string $transcript,
        string $lang,
        string $tone
    ): array|\WP_Error {

        // Truncate to ~4 000 tokens
        if ( mb_strlen( $transcript ) > 16000 ) {
            $transcript = mb_substr( $transcript, 0, 16000 ) . '…';
        }

        $tone_desc = self::TONES[ $tone ] ?? self::TONES['formal'];
        $lang_name = $lang === 'fa' ? 'Persian (Farsi)' : 'English';
        $rtl_note  = $lang === 'fa' ? ' Use RTL-compatible formatting. All headings and body text must be in Persian.' : '';

        $prompt = <<<PROMPT
You are a professional content writer. Convert this YouTube video transcript into a high-quality blog article.

Video title: "{$title}"
Writing tone: {$tone_desc}
Output language: **{$lang_name} only**{$rtl_note}

Transcript:
---
{$transcript}
---

Return ONLY valid JSON with this exact structure:
{
  "title": "Engaging article title",
  "excerpt": "2-3 sentence summary",
  "sections": [
    {
      "type": "intro",
      "heading": null,
      "content": "Introduction paragraph(s). Multiple paragraphs separated by double newline."
    },
    {
      "type": "heading",
      "heading": "Section Heading",
      "content": "Section body text. Multiple paragraphs OK."
    },
    {
      "type": "quote",
      "heading": null,
      "content": "A compelling direct quote from the transcript",
      "attribution": "Timestamp or speaker context"
    },
    {
      "type": "takeaways",
      "heading": "Key Takeaways",
      "items": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"]
    },
    {
      "type": "faq",
      "heading": "Frequently Asked Questions",
      "items": [
        {"question": "Q1?", "answer": "A1."},
        {"question": "Q2?", "answer": "A2."}
      ]
    },
    {
      "type": "conclusion",
      "heading": "Conclusion",
      "content": "Concluding paragraph(s)"
    }
  ],
  "tags": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "key_timestamps": [
    {"time": "0:00", "label": "Introduction"},
    {"time": "2:30", "label": "Topic context"}
  ]
}

Requirements:
- Language: {$lang_name} throughout
- Total 800-1500 words
- At least 3 heading sections
- 1-2 quote blocks with real quotes from transcript
- Exactly 5-7 takeaways
- 3-5 FAQ pairs derived from content
- Extract plausible timestamps from context
PROMPT;

        $result = PAYS_AI_Client::call( $prompt );
        if ( is_wp_error( $result ) ) return $result;

        return self::parse( $result['content'] );
    }

    /* -------------------------------------------------------
       Rewrite with different tone
    ------------------------------------------------------- */

    public static function rewrite( int $post_id, string $tone ): array|\WP_Error {
        $yt_id = (string) get_post_meta( $post_id, 'pa_youtube_id', true );
        $lang  = (string) ( get_post_meta( $post_id, '_pays_article_lang', true ) ?: get_option( 'pays_ai_lang', 'en' ) );

        if ( ! $yt_id ) return new \WP_Error( 'no_yt_id', 'No YouTube ID for this post.' );

        return self::generate( $post_id, $yt_id, $lang, $tone );
    }

    /* -------------------------------------------------------
       Response parser
    ------------------------------------------------------- */

    private static function parse( string $content ): array {
        $data = PAYS_AI_Client::parse_json( $content );
        if ( empty( $data ) ) {
            return [ 'sections' => [], 'tags' => [], 'key_timestamps' => [], 'body_text' => '' ];
        }

        // Build flat body text for keyword extraction
        $body_parts = [];
        foreach ( $data['sections'] ?? [] as $sec ) {
            if ( ! empty( $sec['content'] ) ) $body_parts[] = $sec['content'];
            if ( ! empty( $sec['items'] ) ) {
                foreach ( $sec['items'] as $item ) {
                    $body_parts[] = is_array( $item ) ? implode( ' ', $item ) : (string) $item;
                }
            }
        }
        $data['body_text'] = implode( ' ', $body_parts );

        return $data;
    }
}
