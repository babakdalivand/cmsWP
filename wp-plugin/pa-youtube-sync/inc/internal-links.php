<?php
if ( ! defined('ABSPATH') ) exit;

class PAYS_Internal_Links {

    private const STOP_WORDS = [
        'the','a','an','and','or','but','in','on','at','to','for','of','with',
        'by','from','is','was','are','were','be','been','have','has','had','do',
        'does','did','will','would','could','should','may','might','this','that',
        'these','those','it','its','we','our','you','your','they','their','he',
        'she','his','her','i','my','me','us','him','them','what','which','who',
        'when','where','how','why','not','no','if','than','then','so','as','up',
        'out','about','into','through','during','before','after','above','below',
        'between','each','more','also','just','can','only','very','too','some',
    ];

    public static function suggest( string $text, int $limit = 6 ): array {
        if ( empty( $text ) ) return [];

        $keywords    = self::extract_keywords( $text, 15 );
        $suggestions = [];
        $seen_ids    = [];

        foreach ( $keywords as $kw ) {
            if ( count( $suggestions ) >= $limit ) break;

            $posts = get_posts([
                'post_type'      => [ 'post', 'pa_video', 'pa_short' ],
                'post_status'    => 'publish',
                's'              => $kw,
                'posts_per_page' => 2,
                'orderby'        => 'relevance',
                'fields'         => 'ids',
            ]);

            foreach ( $posts as $pid ) {
                if ( isset( $seen_ids[ $pid ] ) ) continue;
                $seen_ids[ $pid ] = true;

                $suggestions[] = [
                    'post_id'   => $pid,
                    'title'     => get_the_title( $pid ),
                    'url'       => get_permalink( $pid ),
                    'keyword'   => $kw,
                    'post_type' => get_post_type( $pid ),
                ];

                if ( count( $suggestions ) >= $limit ) break;
            }
        }

        return $suggestions;
    }

    /* -------------------------------------------------------
       Keyword extractor — frequency + bigrams
    ------------------------------------------------------- */

    private static function extract_keywords( string $text, int $n = 15 ): array {
        $text  = mb_strtolower( $text );
        $words = preg_split( '/\W+/u', $text );
        $freq  = [];

        foreach ( $words as $w ) {
            $w = trim( $w );
            if ( mb_strlen( $w ) < 4 ) continue;
            if ( in_array( $w, self::STOP_WORDS, true ) ) continue;
            $freq[ $w ] = ( $freq[ $w ] ?? 0 ) + 1;
        }

        // Add bigrams
        $clean = array_values( array_filter(
            $words,
            fn( $w ) => mb_strlen( $w ) >= 4 && ! in_array( $w, self::STOP_WORDS, true )
        ));
        for ( $i = 0; $i < count( $clean ) - 1; $i++ ) {
            $bigram = $clean[ $i ] . ' ' . $clean[ $i + 1 ];
            $freq[ $bigram ] = ( $freq[ $bigram ] ?? 0 ) + 1;
        }

        arsort( $freq );
        return array_keys( array_slice( $freq, 0, $n ) );
    }
}
