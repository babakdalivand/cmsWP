<?php
if ( ! defined('ABSPATH') ) exit;

/**
 * Converts structured article data into native Gutenberg block markup.
 */
class PAYS_Gutenberg {

    public static function from_article_data( array $data, string $lang = 'en' ): string {
        $rtl    = ( $lang === 'fa' );
        $blocks = [];

        foreach ( $data['sections'] ?? [] as $section ) {
            $type = $section['type'] ?? '';

            switch ( $type ) {
                case 'intro':
                case 'heading':
                case 'conclusion':
                    if ( ! empty( $section['heading'] ) ) {
                        $blocks[] = self::heading( $section['heading'], 2, $rtl );
                    }
                    foreach ( self::paragraphs( $section['content'] ?? '' ) as $p ) {
                        $blocks[] = self::paragraph( $p, $rtl );
                    }
                    break;

                case 'quote':
                    if ( ! empty( $section['content'] ) ) {
                        $blocks[] = self::quote( $section['content'], $section['attribution'] ?? '', $rtl );
                    }
                    break;

                case 'takeaways':
                    if ( ! empty( $section['heading'] ) ) {
                        $blocks[] = self::heading( $section['heading'], 3, $rtl );
                    }
                    if ( ! empty( $section['items'] ) ) {
                        $blocks[] = self::list_block( $section['items'], $rtl );
                    }
                    break;

                case 'faq':
                    if ( ! empty( $section['heading'] ) ) {
                        $blocks[] = self::heading( $section['heading'], 2, $rtl );
                    }
                    foreach ( $section['items'] ?? [] as $item ) {
                        $blocks[] = self::details(
                            $item['question'] ?? '',
                            $item['answer']   ?? '',
                            $rtl
                        );
                    }
                    break;
            }
        }

        // Timestamps section
        if ( ! empty( $data['key_timestamps'] ) ) {
            $label    = $rtl ? 'نشانه‌های زمانی' : 'Video Timestamps';
            $blocks[] = self::heading( $label, 3, $rtl );
            $blocks[] = self::timestamps( $data['key_timestamps'], $rtl );
        }

        // Internal link suggestions block (hidden comment for editor info)
        if ( ! empty( $data['link_suggestions'] ) ) {
            $blocks[] = self::link_suggestions_block( $data['link_suggestions'], $rtl );
        }

        return implode( "\n\n", array_filter( $blocks ) );
    }

    /* ── Block builders ─────────────────────────────────────────── */

    public static function heading( string $text, int $level = 2, bool $rtl = false ): string {
        $attrs = $rtl ? [ 'textAlign' => 'right' ] : [];
        $json  = $attrs ? ' ' . wp_json_encode( $attrs ) : '';
        $style = $rtl ? ' style="direction:rtl;text-align:right"' : '';

        return sprintf(
            '<!-- wp:heading {"level":%d%s} --><h%d class="wp-block-heading"%s>%s</h%d><!-- /wp:heading -->',
            $level,
            $attrs ? ',' . substr( wp_json_encode( $attrs ), 1, -1 ) : '',
            $level,
            $style,
            esc_html( $text ),
            $level
        );
    }

    public static function paragraph( string $text, bool $rtl = false ): string {
        if ( empty( trim( $text ) ) ) return '';
        $attrs = $rtl ? ' {"align":"right"}' : '';
        $style = $rtl ? ' style="direction:rtl;text-align:right"' : '';
        return sprintf(
            '<!-- wp:paragraph%s --><p class="wp-block-paragraph"%s>%s</p><!-- /wp:paragraph -->',
            $attrs,
            $style,
            wp_kses_post( $text )
        );
    }

    public static function quote( string $text, string $attribution = '', bool $rtl = false ): string {
        $style = $rtl ? ' style="direction:rtl;text-align:right"' : '';
        $cite  = $attribution
            ? sprintf( '<cite>%s</cite>', esc_html( $attribution ) )
            : '';

        return sprintf(
            '<!-- wp:quote --><blockquote class="wp-block-quote"%s><p>%s</p>%s</blockquote><!-- /wp:quote -->',
            $style,
            esc_html( $text ),
            $cite
        );
    }

    public static function list_block( array $items, bool $rtl = false ): string {
        $style = $rtl ? ' style="direction:rtl"' : '';
        $lis   = implode( '', array_map(
            fn( $i ) => sprintf( '<li>%s</li>', esc_html( is_array( $i ) ? ( $i['text'] ?? '' ) : $i ) ),
            $items
        ));

        return sprintf(
            '<!-- wp:list --><ul class="wp-block-list"%s>%s</ul><!-- /wp:list -->',
            $style,
            $lis
        );
    }

    public static function details( string $question, string $answer, bool $rtl = false ): string {
        $style = $rtl ? ' style="direction:rtl"' : '';
        return sprintf(
            '<!-- wp:details --><details class="wp-block-details"%s><summary>%s</summary><p>%s</p></details><!-- /wp:details -->',
            $style,
            esc_html( $question ),
            esc_html( $answer )
        );
    }

    public static function timestamps( array $ts, bool $rtl = false ): string {
        $style = $rtl ? ' style="direction:rtl"' : '';
        $lis   = implode( '', array_map(
            fn( $t ) => sprintf(
                '<li><strong>%s</strong> — %s</li>',
                esc_html( $t['time']  ?? '' ),
                esc_html( $t['label'] ?? '' )
            ),
            $ts
        ));

        return sprintf(
            '<!-- wp:list {"className":"pays-timestamps"} --><ul class="wp-block-list pays-timestamps"%s>%s</ul><!-- /wp:list -->',
            $style,
            $lis
        );
    }

    private static function link_suggestions_block( array $suggestions, bool $rtl = false ): string {
        $style = $rtl ? ' style="direction:rtl;background:#fff3cd;padding:12px;border-radius:4px"'
                      : ' style="background:#fff3cd;padding:12px;border-radius:4px"';

        $lis = implode( '', array_map(
            fn( $s ) => sprintf(
                '<li><a href="%s">%s</a> <em style="font-size:12px;color:#888">(keyword: %s)</em></li>',
                esc_url( $s['url'] ),
                esc_html( $s['title'] ),
                esc_html( $s['keyword'] ?? '' )
            ),
            $suggestions
        ));

        $label = $rtl ? 'پیشنهاد لینک‌های داخلی' : 'Internal Link Suggestions';

        return sprintf(
            '<!-- wp:group --><div class="wp-block-group pays-link-suggestions"%s><p><strong>🔗 %s</strong></p><ul>%s</ul></div><!-- /wp:group -->',
            $style,
            esc_html( $label ),
            $lis
        );
    }

    /* ── Helpers ─────────────────────────────────────────────────── */

    private static function paragraphs( string $text ): array {
        $parts = preg_split( '/\n{2,}/', trim( $text ) );
        return array_values( array_filter( array_map( 'trim', $parts ) ) );
    }
}
