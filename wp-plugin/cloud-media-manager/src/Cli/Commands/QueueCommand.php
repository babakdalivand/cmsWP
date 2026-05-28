<?php

namespace CMM\Cli\Commands;

use WP_CLI;
use CMM\Queue\Queue;
use CMM\Queue\Worker;

class QueueCommand {
    /**
     * Show queue statistics.
     *
     * ## OPTIONS
     *
     * [--watch]
     * : Refresh every 3 seconds.
     */
    public function status(array $args, array $assoc): void {
        $watch = isset($assoc['watch']);
        do {
            $queue = cmm_plugin()->getContainer()->make(Queue::class);
            $stats = $queue->stats();
            WP_CLI\Utils\format_items('table', [array_merge(['time' => gmdate('H:i:s')], $stats)], array_keys(array_merge(['time'=>''], $stats)));
            if ($watch) { sleep(3); }
        } while ($watch);
    }

    /**
     * Process the queue.
     *
     * ## OPTIONS
     *
     * [--limit=<n>]
     * : Max jobs to process. Default 15.
     *
     * [--watch]
     * : Keep running and process new jobs as they arrive.
     *
     * [--verbose]
     * : Show failed job details.
     */
    public function run(array $args, array $assoc): void {
        $limit   = (int) ($assoc['limit'] ?? 15);
        $watch   = isset($assoc['watch']);
        $verbose = isset($assoc['verbose']);
        $worker  = cmm_plugin()->getContainer()->make(Worker::class);

        do {
            $result = $worker->run($limit);
            WP_CLI::log("Processed: {$result['processed']}, Failed: {$result['failed']}");

            if ($verbose && $result['failed'] > 0) {
                global $wpdb;
                $failed = $wpdb->get_results(
                    "SELECT id, type, error, failed_at FROM {$wpdb->prefix}cmm_jobs WHERE status = 'failed' ORDER BY id DESC LIMIT 10"
                );
                WP_CLI\Utils\format_items('table', $failed, ['id', 'type', 'error', 'failed_at']);
            }

            if ($watch) { sleep(3); }
        } while ($watch);
    }

    /**
     * Prune completed and failed jobs.
     *
     * ## OPTIONS
     *
     * [--days=<n>]
     * : Keep jobs newer than this many days. Default 7.
     */
    public function prune(array $args, array $assoc): void {
        $days  = (int) ($assoc['days'] ?? 7);
        $queue = cmm_plugin()->getContainer()->make(Queue::class);
        $count = $queue->prune($days);
        WP_CLI::success("Pruned $count jobs older than $days days.");
    }
}
