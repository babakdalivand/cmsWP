<?php

namespace CMM\Queue;

class Queue {
    private string $table;

    public function __construct() {
        global $wpdb;
        $this->table = $wpdb->prefix . 'cmm_jobs';
    }

    public function dispatch(string $jobClass, array $payload, int $delaySeconds = 0, int $priority = 5): int {
        global $wpdb;
        $available = $delaySeconds > 0
            ? gmdate('Y-m-d H:i:s', time() + $delaySeconds)
            : current_time('mysql', true);

        $wpdb->insert($this->table, [
            'type'         => $jobClass::TYPE,
            'payload'      => json_encode($payload),
            'status'       => 'pending',
            'max_attempts' => $jobClass::MAX_ATTEMPTS ?? 3,
            'priority'     => $priority,
            'available_at' => $available,
            'created_at'   => current_time('mysql', true),
        ]);
        return (int) $wpdb->insert_id;
    }

    public function reserve(): ?object {
        global $wpdb;
        $wpdb->query('START TRANSACTION');

        $job = $wpdb->get_row(
            "SELECT * FROM {$this->table}
             WHERE status = 'pending' AND available_at <= UTC_TIMESTAMP()
             ORDER BY priority ASC, id ASC
             LIMIT 1
             FOR UPDATE"
        );

        if (!$job) {
            $wpdb->query('ROLLBACK');
            return null;
        }

        $wpdb->update($this->table, [
            'status'      => 'processing',
            'reserved_at' => current_time('mysql', true),
            'attempts'    => $job->attempts + 1,
        ], ['id' => $job->id]);

        $wpdb->query('COMMIT');
        return $job;
    }

    public function complete(int $jobId): void {
        global $wpdb;
        $wpdb->update($this->table, [
            'status'       => 'completed',
            'completed_at' => current_time('mysql', true),
        ], ['id' => $jobId]);
    }

    public function fail(int $jobId, string $error, int $retryDelay = 0): void {
        global $wpdb;
        $job = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$this->table} WHERE id = %d", $jobId));
        if (!$job) return;

        if ($retryDelay > 0 && $job->attempts < $job->max_attempts) {
            $wpdb->update($this->table, [
                'status'       => 'pending',
                'reserved_at'  => null,
                'available_at' => gmdate('Y-m-d H:i:s', time() + $retryDelay),
                'error'        => $error,
            ], ['id' => $jobId]);
        } else {
            $wpdb->update($this->table, [
                'status'    => 'failed',
                'failed_at' => current_time('mysql', true),
                'error'     => $error,
            ], ['id' => $jobId]);
        }
    }

    public function releaseStuck(int $olderThanMinutes = 10): int {
        global $wpdb;
        return (int) $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$this->table}
                 SET status = 'pending', reserved_at = NULL
                 WHERE status = 'processing'
                 AND reserved_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL %d MINUTE)",
                $olderThanMinutes
            )
        );
    }

    public function stats(): array {
        global $wpdb;
        $rows = $wpdb->get_results(
            "SELECT status, COUNT(*) as cnt FROM {$this->table} GROUP BY status"
        ) ?: [];
        $result = ['pending' => 0, 'processing' => 0, 'completed' => 0, 'failed' => 0];
        foreach ($rows as $row) {
            $result[$row->status] = (int) $row->cnt;
        }
        return $result;
    }

    public function prune(int $keepDays = 7): int {
        global $wpdb;
        return (int) $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$this->table}
                 WHERE status IN ('completed','failed')
                 AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL %d DAY)",
                $keepDays
            )
        );
    }
}
