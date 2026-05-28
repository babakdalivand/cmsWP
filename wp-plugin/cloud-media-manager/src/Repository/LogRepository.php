<?php

namespace CMM\Repository;

class LogRepository {
    private string $table;

    public function __construct() {
        global $wpdb;
        $this->table = $wpdb->prefix . 'cmm_logs';
    }

    public function log(string $level, string $message, array $context = []): void {
        global $wpdb;
        $wpdb->insert($this->table, [
            'level'      => $level,
            'message'    => $message,
            'context'    => $context ? json_encode($context) : null,
            'created_at' => current_time('mysql', true),
        ]);
    }

    public function info(string $message, array $ctx = []): void  { $this->log('info',  $message, $ctx); }
    public function warn(string $message, array $ctx = []): void  { $this->log('warn',  $message, $ctx); }
    public function error(string $message, array $ctx = []): void { $this->log('error', $message, $ctx); }

    public function paginate(int $page, int $perPage, array $filters = []): array {
        global $wpdb;
        $where = '1=1';
        $args  = [];

        if (!empty($filters['level'])) {
            $where .= ' AND level = %s';
            $args[] = $filters['level'];
        }
        if (!empty($filters['since'])) {
            $where .= ' AND id > %d';
            $args[] = (int) $filters['since'];
        }

        $offset = ($page - 1) * $perPage;
        $args   = array_merge($args, [$perPage, $offset]);
        $sql    = "SELECT * FROM {$this->table} WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d";
        return $wpdb->get_results($wpdb->prepare($sql, ...$args)) ?: [];
    }

    public function countSince(int $id): int {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$this->table} WHERE id > %d", $id));
    }

    public function pruneOlderThan(int $days): int {
        global $wpdb;
        return (int) $wpdb->query(
            $wpdb->prepare("DELETE FROM {$this->table} WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL %d DAY)", $days)
        );
    }
}
