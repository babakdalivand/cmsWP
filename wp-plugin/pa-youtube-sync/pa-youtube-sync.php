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
require_once PAYS_DIR . 'inc/mod-log.php';
require_once PAYS_DIR . 'inc/duplicate-detector.php';
require_once PAYS_DIR . 'inc/toxicity.php';
require_once PAYS_DIR . 'inc/notification.php';
require_once PAYS_DIR . 'inc/rule-engine.php';
require_once PAYS_DIR . 'inc/moderation.php';
require_once PAYS_DIR . 'inc/analytics.php';
require_once PAYS_DIR . 'inc/membership.php';
require_once PAYS_DIR . 'inc/payment.php';
require_once PAYS_DIR . 'inc/member-rest-api.php';
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
            notes        TEXT DEFAULT NULL,
            queued_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at  DATETIME DEFAULT NULL,
            UNIQUE KEY yt_id (yt_id),
            INDEX (status), INDEX (channel_id)
        ) $c");
    } else {
        // Add notes column if missing (migration for existing installs)
        $cols = $wpdb->get_results("SHOW COLUMNS FROM $q LIKE 'notes'");
        if ( empty( $cols ) ) {
            $wpdb->query("ALTER TABLE $q ADD COLUMN notes TEXT DEFAULT NULL AFTER post_id");
        }
        // Add yt_views column if missing
        $cols = $wpdb->get_results("SHOW COLUMNS FROM $q LIKE 'yt_views'");
        if ( empty( $cols ) ) {
            $wpdb->query("ALTER TABLE $q ADD COLUMN yt_views BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER duration_sec");
        }
    }

    // Moderation rules
    $rules = $wpdb->prefix . 'pays_rules';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$rules'") !== $rules ) {
        $wpdb->query("CREATE TABLE $rules (
            id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name           VARCHAR(200) NOT NULL,
            enabled        TINYINT(1) NOT NULL DEFAULT 1,
            priority       TINYINT UNSIGNED NOT NULL DEFAULT 10,
            condition_mode VARCHAR(3) NOT NULL DEFAULT 'all',
            conditions     LONGTEXT NOT NULL,
            actions        LONGTEXT NOT NULL,
            created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (enabled), INDEX (priority)
        ) $c");
    }

    // Moderation log
    $mlog = $wpdb->prefix . 'pays_mod_log';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$mlog'") !== $mlog ) {
        $wpdb->query("CREATE TABLE $mlog (
            id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            queue_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
            post_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            action     VARCHAR(50) NOT NULL,
            note       TEXT,
            context    LONGTEXT,
            user_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (queue_id), INDEX (action), INDEX (created_at)
        ) $c");
    }

    // Analytics snapshots
    $snap = $wpdb->prefix . 'pays_analytics_snap';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$snap'") !== $snap ) {
        $wpdb->query("CREATE TABLE $snap (
            id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            yt_id        VARCHAR(64) NOT NULL,
            channel_id   VARCHAR(64) NOT NULL,
            type         VARCHAR(16) NOT NULL DEFAULT 'video',
            duration_sec INT DEFAULT 0,
            published_at DATETIME,
            post_id      BIGINT UNSIGNED DEFAULT NULL,
            views        BIGINT UNSIGNED DEFAULT 0,
            likes        BIGINT UNSIGNED DEFAULT 0,
            comments     BIGINT UNSIGNED DEFAULT 0,
            snapped_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX (yt_id), INDEX (channel_id), INDEX (snapped_at), INDEX (type)
        ) $c");
    }

    // Membership subscriptions
    $subs = $wpdb->prefix . 'pays_subscriptions';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$subs'") !== $subs ) {
        $wpdb->query("CREATE TABLE $subs (
            id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id          BIGINT UNSIGNED NOT NULL,
            access_level     VARCHAR(20)  NOT NULL DEFAULT 'basic',
            level_priority   TINYINT UNSIGNED NOT NULL DEFAULT 10,
            status           VARCHAR(20)  NOT NULL DEFAULT 'active',
            plan_id          VARCHAR(100) DEFAULT NULL,
            gateway          VARCHAR(30)  NOT NULL DEFAULT 'manual',
            gateway_sub_id   VARCHAR(200) DEFAULT NULL,
            amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
            currency         VARCHAR(10)  NOT NULL DEFAULT 'IRR',
            started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at       DATETIME DEFAULT NULL,
            cancelled_at     DATETIME DEFAULT NULL,
            cancel_reason    VARCHAR(200) DEFAULT NULL,
            telegram_synced  TINYINT(1) NOT NULL DEFAULT 0,
            INDEX (user_id), INDEX (status), INDEX (expires_at), INDEX (access_level)
        ) $c");
    }

    // Payment transactions
    $txns = $wpdb->prefix . 'pays_payment_transactions';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$txns'") !== $txns ) {
        $wpdb->query("CREATE TABLE $txns (
            id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id       BIGINT UNSIGNED NOT NULL,
            gateway       VARCHAR(30)  NOT NULL,
            order_id      VARCHAR(100) NOT NULL UNIQUE,
            amount        DECIMAL(10,2) NOT NULL,
            currency      VARCHAR(10)  NOT NULL DEFAULT 'IRR',
            level         VARCHAR(20)  NOT NULL DEFAULT 'basic',
            duration_days INT NOT NULL DEFAULT 30,
            status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
            gateway_ref   VARCHAR(200) DEFAULT NULL,
            ref_id        VARCHAR(200) DEFAULT NULL,
            created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at  DATETIME DEFAULT NULL,
            INDEX (user_id), INDEX (status), INDEX (order_id)
        ) $c");
    }

    // Access tokens (short-lived, for API clients)
    $tokens = $wpdb->prefix . 'pays_access_tokens';
    if ( $wpdb->get_var("SHOW TABLES LIKE '$tokens'") !== $tokens ) {
        $wpdb->query("CREATE TABLE $tokens (
            id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id     BIGINT UNSIGNED NOT NULL,
            token_hash  VARCHAR(64) NOT NULL UNIQUE,
            expires_at  DATETIME NOT NULL,
            INDEX (user_id), INDEX (token_hash), INDEX (expires_at)
        ) $c");
    }
}
