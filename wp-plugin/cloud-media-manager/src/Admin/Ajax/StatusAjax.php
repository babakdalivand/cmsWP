<?php

namespace CMM\Admin\Ajax;

use CMM\Container;
use CMM\Repository\ProviderRepository;
use CMM\Repository\FileRepository;
use CMM\Queue\Queue;

class StatusAjax {
    public function __construct(private readonly Container $container) {}

    public function getStatus(): void {
        $fileRepo  = $this->container->make(FileRepository::class);
        $provRepo  = $this->container->make(ProviderRepository::class);
        $queue     = $this->container->make(Queue::class);
        $health    = get_transient('cmm_health_status') ?: [];

        $stats = $fileRepo->stats();
        $map   = ['pending' => 0, 'synced' => 0, 'failed' => 0, 'orphan' => 0];
        foreach ($stats as $row) $map[$row->status] = (int) $row->cnt;

        $providers = array_map(function ($p) use ($health) {
            return [
                'id'      => $p->id,
                'name'    => $p->name,
                'type'    => $p->type,
                'default' => (bool) $p->is_default,
                'healthy' => $health[$p->id] ?? null,
            ];
        }, $provRepo->all());

        $jobStats = $queue->stats();

        wp_send_json_success([
            'files'     => $map,
            'total'     => array_sum($map),
            'providers' => $providers,
            'queue'     => $jobStats,
        ]);
    }

    public function networkStats(): void {
        if (!is_multisite()) {
            wp_send_json_error(['message' => 'Not multisite']);
        }
        $collector = $this->container->make(\CMM\Multisite\NetworkStatsCollector::class);
        wp_send_json_success($collector->collect());
    }
}
