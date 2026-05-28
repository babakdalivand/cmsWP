<?php

namespace CMM\Database;

class Schema {
    public static function install(): void {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();

        dbDelta("CREATE TABLE {$wpdb->prefix}cmm_providers (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name            VARCHAR(100)    NOT NULL,
            type            ENUM('r2','s3','b2','gdrive','local') NOT NULL,
            credentials     LONGTEXT        NOT NULL,
            is_active       TINYINT(1)      NOT NULL DEFAULT 1,
            is_default      TINYINT(1)      NOT NULL DEFAULT 0,
            last_ping_at    DATETIME        NULL,
            last_ping_ok    TINYINT(1)      NULL,
            created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_active (is_active),
            KEY idx_default (is_default)
        ) $charset;");

        dbDelta("CREATE TABLE {$wpdb->prefix}cmm_files (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            post_id         BIGINT UNSIGNED NULL,
            provider_id     BIGINT UNSIGNED NOT NULL,
            local_path      VARCHAR(1000)   NOT NULL,
            remote_key      VARCHAR(1000)   NOT NULL,
            remote_url      VARCHAR(2000)   NOT NULL,
            file_size       BIGINT UNSIGNED NOT NULL DEFAULT 0,
            mime_type       VARCHAR(100)    NOT NULL DEFAULT '',
            status          ENUM('pending','synced','failed','orphan') NOT NULL DEFAULT 'pending',
            synced_at       DATETIME        NULL,
            error_message   TEXT            NULL,
            created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_post (post_id),
            KEY idx_provider (provider_id),
            KEY idx_status (status)
        ) $charset;");

        dbDelta("CREATE TABLE {$wpdb->prefix}cmm_logs (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            level           ENUM('info','warn','error') NOT NULL DEFAULT 'info',
            message         TEXT            NOT NULL,
            context         LONGTEXT        NULL,
            created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_level (level),
            KEY idx_created (created_at)
        ) $charset;");

        dbDelta("CREATE TABLE {$wpdb->prefix}cmm_jobs (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            type            VARCHAR(100)    NOT NULL,
            payload         LONGTEXT        NOT NULL,
            status          ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
            attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
            max_attempts    TINYINT UNSIGNED NOT NULL DEFAULT 3,
            priority        TINYINT UNSIGNED NOT NULL DEFAULT 5,
            available_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reserved_at     DATETIME        NULL,
            completed_at    DATETIME        NULL,
            failed_at       DATETIME        NULL,
            error           TEXT            NULL,
            created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_status_priority (status, priority, available_at)
        ) $charset;");

        update_option('cmm_db_version', CMM_VERSION);
    }

    public static function uninstall(): void {
        global $wpdb;
        foreach (['cmm_jobs', 'cmm_logs', 'cmm_files', 'cmm_providers'] as $table) {
            $wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}{$table}");
        }
        delete_option('cmm_db_version');
        delete_option('cmm_settings');
    }
}
