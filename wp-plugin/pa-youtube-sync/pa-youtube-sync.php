<?php
/**
 * Plugin Name: PA YouTube Sync
 * Plugin URI:  https://persianatheists.com
 * Description: همگام‌سازی ویدیو، شورت، لایو و پلی‌لیست از یوتیوب — با صف انتظار و REST API
 * Version:     2.0.0
 * Author:      RAHA Network
 */

if ( ! defined('ABSPATH') ) exit;

define( 'PAYS_DIR',     plugin_dir_path(__FILE__) );
define( 'PAYS_URI',     plugin_dir_url(__FILE__)  );
define( 'PAYS_VERSION', '2.0.0'                   );

require_once PAYS_DIR . 'inc/api.php';
require_once PAYS_DIR . 'inc/importer.php';
require_once PAYS_DIR . 'inc/cron.php';
require_once PAYS_DIR . 'inc/webhook.php';
require_once PAYS_DIR . 'inc/transcript.php';
require_once PAYS_DIR . 'inc/ai-client.php';
require_once PAYS_DIR . 'inc/ai-seo.php';
require_once PAYS_DIR . 'inc/schema.php';
require_once PAYS_DIR . 'inc/gutenberg.php';
require_once PAYS_DIR . 'inc/internal-links.php';
require_once PAYS_DIR . 'inc/featured-image.php';
require_once PAYS_DIR . 'inc/article-generator.php';
require_once PAYS_DIR . 'inc/article-queue.php';
require_once PAYS_DIR . 'inc/taxonomy.php';
require_once PAYS_DIR . 'inc/rest-api.php';
require_once PAYS_DIR . 'inc/admin.php';
require_once PAYS_DIR . 'inc/ai-admin.php';
require_once PAYS_DIR . 'inc/shortcodes.php';

register_activation_hook(   __FILE__, 'pays_activate'   );
register_deactivation_hook( __FILE__, 'pays_deactivate' );

function pays_activate(): void {
    pays_create_tables();
    pays_schedule_cron();
}
function pays_deactivate(): void {
    wp_clear_scheduled_hook('pays_sync_event');
    wp_clear_scheduled_hook('pays_resub_event');
}

function pays_create_tables(): void {
    global $wpdb;
    $c = $wpdb->get_charset_collate();

    // Import log
    $log = $wpdb->prefix . 'pays_log';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$log'") !== $log ) {
        $wpdb->query("CREATE TABLE $log (
            id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            channel_id VARCHAR(64) NOT NULL,
            yt_id      VARCHAR(64) NOT NULL,
            post_id    BIGINT UNSIGNED DEFAULT NULL,
            type       VARCHAR(16) NOT NULL DEFAULT 'video',
            action     VARCHAR(16) NOT NULL DEFAULT 'created',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (channel_id), INDEX (yt_id)
        ) $c");
    }

    // Transcripts
    $tr = $wpdb->prefix . 'pays_transcripts';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$tr'") !== $tr ) {
        $wpdb->query("CREATE TABLE $tr (
            id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            yt_id       VARCHAR(64) NOT NULL,
            language    VARCHAR(10) NOT NULL DEFAULT 'en',
            source      VARCHAR(20) NOT NULL DEFAULT 'auto',
            raw_text    LONGTEXT,
            timed_json  LONGTEXT,
            word_count  INT DEFAULT 0,
            fetched_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY yt_lang (yt_id, language),
            FULLTEXT KEY ft_transcript (raw_text)
        ) $c");
    }

    // AI Content
    $ai = $wpdb->prefix . 'pays_ai_content';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$ai'") !== $ai ) {
        $wpdb->query("CREATE TABLE $ai (
            id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            post_id           BIGINT UNSIGNED NOT NULL,
            yt_id             VARCHAR(64) NOT NULL,
            language          VARCHAR(10) NOT NULL DEFAULT 'en',
            seo_title         VARCHAR(200),
            meta_description  VARCHAR(320),
            excerpt           TEXT,
            tags              TEXT,
            faq_schema        LONGTEXT,
            article_content   LONGTEXT,
            schema_json       LONGTEXT,
            ai_provider       VARCHAR(20),
            model             VARCHAR(50),
            prompt_tokens     INT DEFAULT 0,
            completion_tokens INT DEFAULT 0,
            generated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY post_lang (post_id, language),
            INDEX (yt_id)
        ) $c");
    }

    // Article generation queue
    $aq = $wpdb->prefix . 'pays_article_queue';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$aq'") !== $aq ) {
        $wpdb->query("CREATE TABLE $aq (
            id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            post_id      BIGINT UNSIGNED NOT NULL,
            yt_id        VARCHAR(64) NOT NULL,
            lang         VARCHAR(10) NOT NULL DEFAULT 'en',
            tone         VARCHAR(20) NOT NULL DEFAULT 'formal',
            status       VARCHAR(20) NOT NULL DEFAULT 'pending',
            retries      TINYINT UNSIGNED NOT NULL DEFAULT 0,
            error_msg    TEXT,
            created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME DEFAULT NULL,
            INDEX (status), INDEX (post_id)
        ) $c");
    }

    // Video queue
    $q = $wpdb->prefix . 'pays_queue';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$q'") !== $q ) {
        $wpdb->query("CREATE TABLE $q (
            id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            yt_id        VARCHAR(64) NOT NULL,
            channel_id   VARCHAR(64) NOT NULL,
            type         VARCHAR(16) NOT NULL DEFAULT 'video',
            title        TEXT NOT NULL,
            description  LONGTEXT,
            thumbnail    VARCHAR(500),
            duration_sec INT DEFAULT 0,
            published_at DATETIME,
            status       VARCHAR(16) NOT NULL DEFAULT 'pending',
            post_id      BIGINT UNSIGNED DEFAULT NULL,
            queued_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at  DATETIME DEFAULT NULL,
            UNIQUE KEY yt_id (yt_id),
            INDEX (status), INDEX (channel_id)
        ) $c");
    }
}
