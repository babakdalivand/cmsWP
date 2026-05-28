<?php

namespace CMM\Cron;

use CMM\Queue\Worker;
use CMM\Repository\ProviderRepository;

class CronRunner {
    public function __construct(
        private readonly Worker             $worker,
        private readonly ProviderRepository $providers
    ) {}

    public function register(): void {
        add_action('cmm_process_queue', [$this, 'processQueue']);
        add_action('cmm_prune_jobs',    [$this, 'pruneJobs']);
        add_action('cmm_health_check',  [$this, 'healthCheck']);
    }

    public function processQueue(): void {
        $lock = 'cmm_queue_lock';
        if (get_transient($lock)) return;
        set_transient($lock, 1, 55);

        try {
            $this->worker->run(15);
        } finally {
            delete_transient($lock);
        }
    }

    public function pruneJobs(): void {
        global $wpdb;
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}cmm_jobs WHERE status IN ('completed','failed') AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL %d DAY)",
                7
            )
        );
    }

    public function healthCheck(): void {
        $results = [];
        foreach ($this->providers->active() as $provider) {
            $ok            = false;
            $storage       = cmm_plugin()->getContainer()->make(\CMM\Services\StorageService::class);
            try { $ok = $storage->pingProvider((int) $provider->id); } catch (\Throwable) {}
            $results[$provider->id] = $ok;
        }
        set_transient('cmm_health_status', $results, 600);
    }
}
