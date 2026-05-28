<?php

namespace CMM\Repository;

class ProviderRepository {
    private string $table;

    public function __construct() {
        global $wpdb;
        $this->table = $wpdb->prefix . 'cmm_providers';
    }

    public function all(): array {
        global $wpdb;
        return $wpdb->get_results("SELECT * FROM {$this->table} ORDER BY is_default DESC, id ASC") ?: [];
    }

    public function active(): array {
        global $wpdb;
        return $wpdb->get_results(
            $wpdb->prepare("SELECT * FROM {$this->table} WHERE is_active = %d", 1)
        ) ?: [];
    }

    public function find(int $id): ?object {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table} WHERE id = %d", $id));
    }

    public function default(): ?object {
        global $wpdb;
        return $wpdb->get_row(
            $wpdb->prepare("SELECT * FROM {$this->table} WHERE is_default = %d AND is_active = %d LIMIT 1", 1, 1)
        );
    }

    public function save(array $data): int {
        global $wpdb;
        $wpdb->insert($this->table, $data);
        return (int) $wpdb->insert_id;
    }

    public function update(int $id, array $data): void {
        global $wpdb;
        $wpdb->update($this->table, $data, ['id' => $id]);
    }

    public function delete(int $id): void {
        global $wpdb;
        $wpdb->delete($this->table, ['id' => $id]);
    }

    public function setDefault(int $id): void {
        global $wpdb;
        $wpdb->query("UPDATE {$this->table} SET is_default = 0");
        $wpdb->update($this->table, ['is_default' => 1], ['id' => $id]);
    }

    public function updatePingStatus(int $id, bool $ok): void {
        global $wpdb;
        $wpdb->update($this->table, [
            'last_ping_at' => current_time('mysql', true),
            'last_ping_ok' => $ok ? 1 : 0,
        ], ['id' => $id]);
    }
}
