<?php

namespace CMM\Admin\Ajax;

use CMM\Container;
use CMM\Repository\FileRepository;
use CMM\Queue\Queue;
use CMM\Queue\Jobs\UploadJob;
use CMM\Services\StorageService;

class FileAjax {
    public function __construct(private readonly Container $container) {}

    public function listFiles(): void {
        $repo    = $this->container->make(FileRepository::class);
        $page    = max(1, (int) ($_POST['page']   ?? 1));
        $perPage = min(100, (int) ($_POST['per_page'] ?? 20));
        $filters = [
            'status'      => sanitize_key($_POST['status']      ?? ''),
            'provider_id' => (int) ($_POST['provider_id'] ?? 0) ?: null,
            'search'      => sanitize_text_field($_POST['search'] ?? ''),
        ];

        wp_send_json_success([
            'files' => $repo->paginate($page, $perPage, array_filter($filters)),
            'total' => $repo->count(array_filter($filters)),
        ]);
    }

    public function deleteFiles(): void {
        $ids = array_map('intval', $_POST['ids'] ?? []);
        if (empty($ids)) {
            wp_send_json_error(['message' => 'No IDs provided']);
        }

        $repo    = $this->container->make(FileRepository::class);
        $storage = $this->container->make(StorageService::class);
        $deleted = 0;

        foreach ($ids as $id) {
            $file = $repo->find($id);
            if (!$file) continue;
            try {
                $storage->deleteFile($file->remote_key, (int) $file->provider_id);
            } catch (\Throwable) {}
            $repo->deleteByPostId((int) ($file->post_id ?? 0));
            $deleted++;
        }

        wp_send_json_success(['deleted' => $deleted]);
    }

    public function resyncFiles(): void {
        $ids   = array_map('intval', $_POST['ids'] ?? []);
        $repo  = $this->container->make(FileRepository::class);
        $queue = $this->container->make(Queue::class);
        $count = 0;

        foreach ($ids as $id) {
            $file = $repo->find($id);
            if (!$file || !file_exists($file->local_path)) continue;
            $queue->dispatch(UploadJob::class, [
                'file_path' => $file->local_path,
                'post_id'   => $file->post_id,
                'mime_type' => $file->mime_type,
            ]);
            $count++;
        }

        wp_send_json_success(['queued' => $count]);
    }
}
