<?php

namespace CMM\Queue\Jobs;

use CMM\Queue\RetryableException;
use CMM\Services\StorageService;
use CMM\Repository\FileRepository;

class UploadJob implements JobInterface {
    public const TYPE         = 'cmm.upload';
    public const MAX_ATTEMPTS = 3;

    private StorageService  $storage;
    private FileRepository  $files;
    private array           $payload;

    public function __construct(array $payload, StorageService $storage, FileRepository $files) {
        $this->payload = $payload;
        $this->storage = $storage;
        $this->files   = $files;
    }

    public function handle(): void {
        $localPath  = $this->payload['file_path'];
        $mimeType   = $this->payload['mime_type'] ?? mime_content_type($localPath) ?: 'application/octet-stream';
        $providerId = $this->payload['provider_id'] ?? null;

        try {
            $result = $this->storage->uploadFile($localPath, $mimeType, $providerId);
        } catch (\Throwable $e) {
            if ($this->isNetworkError($e->getMessage())) {
                throw new RetryableException($e->getMessage(), $this->retryDelay(1));
            }
            throw $e;
        }

        $postId   = $this->payload['post_id'] ?? null;
        $existing = $postId ? $this->files->findByPostId((int) $postId) : null;

        $record = [
            'provider_id' => $result['provider_id'],
            'remote_key'  => $result['remote_key'],
            'remote_url'  => $result['remote_url'],
            'status'      => 'synced',
            'synced_at'   => current_time('mysql', true),
        ];

        if ($existing) {
            $this->files->update((int) $existing->id, $record);
        } else {
            $this->files->save(array_merge($record, [
                'local_path' => $localPath,
                'post_id'    => $postId,
                'mime_type'  => $mimeType,
                'file_size'  => filesize($localPath) ?: 0,
            ]));
        }

        $settings = get_option('cmm_settings', []);
        if (!empty($settings['delete_local']) && file_exists($localPath)) {
            unlink($localPath);
        }
    }

    public function maxAttempts(): int { return self::MAX_ATTEMPTS; }

    public function retryDelay(int $attempt): int {
        return match ($attempt) {
            1 => 60,
            2 => 300,
            default => 900,
        };
    }

    private function isNetworkError(string $message): bool {
        foreach (['timeout', 'connection', 'curl', 'network', 'reset', 'refused'] as $kw) {
            if (stripos($message, $kw) !== false) return true;
        }
        return false;
    }
}
