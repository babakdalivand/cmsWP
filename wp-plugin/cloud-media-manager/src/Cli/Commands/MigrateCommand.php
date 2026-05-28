<?php

namespace CMM\Cli\Commands;

use WP_CLI;
use CMM\Services\StorageService;
use CMM\Queue\Queue;
use CMM\Queue\Jobs\UploadJob;
use CMM\Repository\ProviderRepository;

class MigrateCommand {
    /**
     * Migrate local media files to cloud storage.
     *
     * ## OPTIONS
     *
     * [--dry-run]
     * : Preview without uploading.
     *
     * [--async]
     * : Queue jobs instead of uploading immediately.
     *
     * [--skip-existing]
     * : Skip files that already exist on the provider.
     *
     * [--provider=<id>]
     * : Use specific provider ID.
     *
     * ## EXAMPLES
     *
     *   wp cmm migrate run --dry-run
     *   wp cmm migrate run --async --skip-existing
     */
    public function run(array $args, array $assoc): void {
        $dryRun       = isset($assoc['dry-run']);
        $async        = isset($assoc['async']);
        $skipExisting = isset($assoc['skip-existing']);
        $providerId   = isset($assoc['provider']) ? (int) $assoc['provider'] : null;

        global $wpdb;
        $attachments = $wpdb->get_results(
            "SELECT ID, guid FROM {$wpdb->prefix}posts
             WHERE post_type = 'attachment' AND post_status = 'inherit'
             ORDER BY ID DESC LIMIT 1000"
        );

        WP_CLI::log('Found ' . count($attachments) . ' attachments.');
        if ($dryRun) { WP_CLI::success('Dry run — no files uploaded.'); return; }

        $storage  = cmm_plugin()->getContainer()->make(StorageService::class);
        $queue    = cmm_plugin()->getContainer()->make(Queue::class);
        $provider = $providerId
            ? cmm_plugin()->getContainer()->make(ProviderRepository::class)->find($providerId)
            : cmm_plugin()->getContainer()->make(ProviderRepository::class)->default();

        if (!$provider) { WP_CLI::error('No provider configured.'); return; }

        $adapter  = $storage->buildAdapter($provider);
        $progress = WP_CLI\Utils\make_progress_bar('Migrating', count($attachments));
        $ok       = $fail = $skip = 0;

        foreach ($attachments as $post) {
            $path = get_attached_file((int) $post->ID);
            $progress->tick();

            if (!$path || !file_exists($path)) { $skip++; continue; }

            if ($skipExisting) {
                $rel = ltrim(str_replace(wp_upload_dir()['basedir'], '', $path), '/\\');
                if ($adapter->exists($rel)) { $skip++; continue; }
            }

            if ($async) {
                $queue->dispatch(UploadJob::class, [
                    'file_path'   => $path,
                    'post_id'     => $post->ID,
                    'mime_type'   => get_post_mime_type((int) $post->ID),
                    'provider_id' => $provider->id,
                ]);
                $ok++;
            } else {
                try {
                    $storage->uploadFile($path, get_post_mime_type((int) $post->ID), (int) $provider->id);
                    $ok++;
                } catch (\Throwable $e) {
                    WP_CLI::warning("Failed {$post->ID}: " . $e->getMessage());
                    $fail++;
                }
            }
        }

        $progress->finish();
        $mode = $async ? 'queued' : 'uploaded';
        WP_CLI::success("Done — $ok $mode, $skip skipped, $fail failed.");
    }
}
