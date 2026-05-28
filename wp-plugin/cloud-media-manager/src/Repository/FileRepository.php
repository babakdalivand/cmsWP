<?php

namespace CMM\Repository;

class FileRepository {
    private string $table;

    public function __construct() {
        global $wpdb;
        $this->table = $wpdb->prefix . 'cmm_files';
    }

    public function find(int $id): ?object {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table} WHERE id = %d", $id));
    }

    public function findByPostId(int $postId): ?object {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table} WHERE post_id = %d LIMIT 1", $postId));
    }

    public function findByLocalPath(string $path): ?object {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table} WHERE local_path = %s LIMIT 1", $path));
    }

    public function paginate(int $page, int $perPage, array $filters = []): array {
        global $wpdb;
        $where = '1=1';
        $args  = [];

        if (!empty($filters['status'])) {
            $where .= ' AND status = %s';
            $args[] = $filters['status'];
        }
        if (!empty($filters['provider_id'])) {
            $where .= ' AND provider_id = %d';
            $args[] = (int) $filters['provider_id'];
        }
        if (!empty($filters['search'])) {
            $where .= ' AND local_path LIKE %s';
            $args[] = '%' . $wpdb->esc_like($filters['search']) . '%';
        }

        $offset = ($page - 1) * $perPage;
        $args   = array_merge($args, [$perPage, $offset]);
        $sql    = "SELECT * FROM {$this->table} WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d";

        return $wpdb->get_results(
            empty($args) ? $sql : $wpdb->prepare($sql, ...$args)
        ) ?: [];
    }

    public function count(array $filters = []): int {
        global $wpdb;
        $where = '1=1';
        $args  = [];

        if (!empty($filters['status'])) {
            $where .= ' AND status = %s';
            $args[] = $filters['status'];
        }
        $sql = "SELECT COUNT(*) FROM {$this->table} WHERE $where";
        return (int) $wpdb->get_var(empty($args) ? $sql : $wpdb->prepare($sql, ...$args));
    }

    public function stats(): array {
        global $wpdb;
        return $wpdb->get_results(
            "SELECT status, COUNT(*) as cnt FROM {$this->table} GROUP BY status"
        ) ?: [];
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

    public function deleteByPostId(int $postId): void {
        global $wpdb;
        $wpdb->delete($this->table, ['post_id' => $postId]);
    }

    public function localFiles(): array {
        global $wpdb;
        $upload = wp_upload_dir();
        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}posts p
                 LEFT JOIN {$this->table} f ON f.post_id = p.ID
                 WHERE p.post_type = 'attachment' AND p.post_status = 'inherit'
                 AND f.id IS NULL
                 LIMIT %d",
                500
            )
        ) ?: [];
    }
}
