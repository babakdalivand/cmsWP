<?php
if ( ! defined('ABSPATH') ) exit;

/* -------------------------------------------------------
   Admin page + React app mount
------------------------------------------------------- */

add_action( 'admin_menu', function () {
    add_submenu_page(
        'pays-channels',
        'AI SEO',
        '🤖 AI SEO',
        'manage_options',
        'pays-ai-seo',
        'pays_ai_seo_page_html'
    );
}, 20 );

function pays_ai_seo_page_html(): void {
    echo '<div id="pays-ai-seo-root" style="margin-top:20px;"></div>';
}

add_action( 'admin_enqueue_scripts', function ( string $hook ) {
    if ( $hook !== 'youtube-sync_page_pays-ai-seo' ) return;

    $dist = PAYS_URI . 'admin-ui/dist/index.js';
    $ver  = PAYS_VERSION . '.' . filemtime( PAYS_DIR . 'admin-ui/dist/index.js' );

    wp_enqueue_script(
        'pays-ai-seo',
        $dist,
        [ 'wp-element', 'wp-components', 'wp-i18n', 'wp-api-fetch' ],
        $ver,
        true
    );

    wp_localize_script( 'pays-ai-seo', 'paysAI', [
        'nonce'    => wp_create_nonce( 'wp_rest' ),
        'apiBase'  => rest_url( 'pa-yt/v1' ),
        'settings' => [
            'ai_enabled'   => (bool) get_option( 'pays_ai_enabled',    false ),
            'ai_provider'  => get_option( 'pays_ai_provider',  'openai' ),
            'ai_model'     => get_option( 'pays_ai_model',     '' ),
            'ai_lang'      => get_option( 'pays_ai_lang',      'en' ),
            'auto_article' => (bool) get_option( 'pays_auto_article', false ),
        ],
    ]);

    wp_enqueue_style( 'wp-components' );
});

/* -------------------------------------------------------
   Meta box on pa_video / pa_short edit screen
------------------------------------------------------- */

add_action( 'add_meta_boxes', function () {
    foreach ( [ 'pa_video', 'pa_short' ] as $pt ) {
        add_meta_box(
            'pays_ai_seo_box',
            '🤖 AI SEO',
            'pays_ai_seo_meta_box_html',
            $pt,
            'normal',
            'high'
        );
    }
});

function pays_ai_seo_meta_box_html( \WP_Post $post ): void {
    $yt_id = get_post_meta( $post->ID, 'pa_youtube_id', true );
    $lang  = get_option( 'pays_ai_lang', 'en' );
    $ai    = PAYS_AI_SEO::get( $post->ID, $lang );
    $tr    = $yt_id ? PAYS_Transcript::get( $yt_id, $lang ) : null;
    ?>
    <style>
    .pays-ai-box { font-family: inherit; }
    .pays-ai-box .pays-row { margin-bottom:12px; }
    .pays-ai-box label { font-weight:600; display:block; margin-bottom:4px; }
    .pays-ai-box .pays-val { background:#f6f7f7; border:1px solid #dcdcde; border-radius:4px; padding:8px; font-size:13px; }
    .pays-ai-box .pays-actions { display:flex; gap:8px; margin-bottom:16px; }
    </style>
    <div class="pays-ai-box">
        <div class="pays-actions">
            <?php if ( $yt_id ) : ?>
            <a href="<?php echo esc_url( admin_url( 'admin-post.php?action=pays_fetch_transcript&yt_id=' . urlencode( $yt_id ) . '&post_id=' . $post->ID . '&_wpnonce=' . wp_create_nonce('pays_fetch') ) ); ?>"
               class="button"><?php echo $tr ? '🔄 Refresh Transcript' : '📥 Fetch Transcript'; ?></a>
            <a href="<?php echo esc_url( admin_url( 'admin-post.php?action=pays_generate_ai&post_id=' . $post->ID . '&yt_id=' . urlencode( $yt_id ) . '&_wpnonce=' . wp_create_nonce('pays_gen') ) ); ?>"
               class="button button-primary">✨ Generate AI SEO</a>
            <?php endif; ?>
        </div>

        <?php if ( $tr ) : ?>
        <div class="pays-row">
            <label>📝 Transcript (<?php echo (int)$tr['word_count']; ?> words, <?php echo esc_html($tr['language']); ?>)</label>
            <div class="pays-val" style="max-height:80px;overflow:auto;font-size:12px;">
                <?php echo esc_html( mb_substr( $tr['raw_text'], 0, 300 ) ); ?>…
            </div>
        </div>
        <?php endif; ?>

        <?php if ( $ai ) : ?>
        <div class="pays-row">
            <label>🏷 SEO Title</label>
            <div class="pays-val"><?php echo esc_html( $ai['seo_title'] ); ?></div>
        </div>
        <div class="pays-row">
            <label>📋 Meta Description</label>
            <div class="pays-val"><?php echo esc_html( $ai['meta_description'] ); ?></div>
        </div>
        <div class="pays-row">
            <label>🏷 Tags</label>
            <div class="pays-val"><?php echo esc_html( $ai['tags'] ); ?></div>
        </div>
        <p style="font-size:12px;color:#666;">
            Generated: <?php echo esc_html( $ai['generated_at'] ); ?>
            via <?php echo esc_html( $ai['ai_provider'] . '/' . $ai['model'] ); ?>
            (<?php echo (int)$ai['prompt_tokens']; ?>+<?php echo (int)$ai['completion_tokens']; ?> tokens)
        </p>
        <?php else : ?>
        <p style="color:#888;">No AI content generated yet.</p>
        <?php endif; ?>
    </div>
    <?php
}

/* -------------------------------------------------------
   Admin POST handlers (meta box buttons)
------------------------------------------------------- */

add_action( 'admin_post_pays_fetch_transcript', function () {
    check_admin_referer( 'pays_fetch' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );

    $yt_id   = sanitize_text_field( $_GET['yt_id']   ?? '' );
    $post_id = (int) ( $_GET['post_id'] ?? 0 );

    if ( $yt_id ) {
        $lang = get_option( 'pays_ai_lang', 'en' );
        PAYS_Transcript::fetch( $yt_id, $lang, true );
    }

    wp_redirect( get_edit_post_link( $post_id, 'raw' ) . '&pays_msg=transcript_fetched' );
    exit;
});

add_action( 'admin_post_pays_generate_ai', function () {
    check_admin_referer( 'pays_gen' );
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Forbidden' );

    $post_id = (int) ( $_GET['post_id'] ?? 0 );
    $yt_id   = sanitize_text_field( $_GET['yt_id'] ?? '' );
    $lang    = get_option( 'pays_ai_lang', 'en' );

    if ( $post_id && $yt_id ) {
        $result = PAYS_AI_SEO::generate( $post_id, $yt_id, $lang );
        if ( ! is_wp_error( $result ) && get_option( 'pays_auto_article' ) ) {
            PAYS_AI_SEO::apply_to_post( $post_id, $result );
        }
    }

    wp_redirect( get_edit_post_link( $post_id, 'raw' ) . '&pays_msg=ai_generated' );
    exit;
});
