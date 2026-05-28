<?php

namespace CMM\Cli\Commands;

use WP_CLI;
use CMM\Multisite\SiteSwitcher;
use CMM\Multisite\NetworkBroadcast;
use CMM\Multisite\NetworkStatsCollector;
use CMM\Queue\Worker;

class NetworkCommand {
    /**
     * Show per-site status.
     */
    public function status(array $args, array $assoc): void {
        $collector = new NetworkStatsCollector();
        $rows      = [];
        foreach ($collector->collect() as $site) {
            $rows[] = [
                'id'         => $site['blog_id'],
                'name'       => $site['name'],
                'synced'     => $site['files']['synced'],
                'pending'    => $site['files']['pending'],
                'failed'     => $site['files']['failed'],
                'health'     => $site['health'],
                'registered' => $site['registered'] ? 'yes' : 'no',
            ];
        }
        WP_CLI\Utils\format_items('table', $rows, ['id','name','synced','pending','failed','health','registered']);
    }

    /**
     * Trigger migration on all or specific sites.
     *
     * ## OPTIONS
     *
     * [--site=<id>]
     * : Specific blog_id, otherwise all sites.
     *
     * [--async]
     * : Queue jobs instead of running synchronously.
     */
    public function migrate(array $args, array $assoc): void {
        $broadcast = new NetworkBroadcast();
        $broadcast->broadcastMigration($assoc);
        WP_CLI::success('Migration queued on all sites.');
    }

    /**
     * Broadcast config to all sites.
     *
     * ## OPTIONS
     *
     * <config>
     * : JSON-encoded config object.
     *
     * ## EXAMPLES
     *
     *   wp cmm network broadcast '{"auto_upload":"1","delete_local":"0"}'
     */
    public function broadcast(array $args, array $assoc): void {
        $json = $args[0] ?? '{}';
        $data = json_decode($json, true) ?: [];
        (new NetworkBroadcast())->broadcastConfig($data);
        WP_CLI::success('Config broadcast complete.');
    }

    /**
     * Process queue on all sites.
     *
     * ## OPTIONS
     *
     * [--limit=<n>]
     * : Jobs per site. Default 15.
     */
    public function run_queue(array $args, array $assoc): void {
        $limit    = (int) ($assoc['limit'] ?? 15);
        $switcher = new SiteSwitcher();
        $switcher->runOnAllSites(function () use ($limit) {
            $worker = cmm_plugin()->getContainer()->make(Worker::class);
            $result = $worker->run($limit);
            WP_CLI::log(get_site_url() . " — processed: {$result['processed']}, failed: {$result['failed']}");
        });
        WP_CLI::success('Queue processed on all sites.');
    }
}
