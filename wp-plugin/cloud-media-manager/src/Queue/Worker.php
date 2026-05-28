<?php

namespace CMM\Queue;

use CMM\Queue\Jobs\UploadJob;
use CMM\Services\StorageService;
use CMM\Repository\FileRepository;

class Worker {
    private const JOB_MAP = [
        UploadJob::TYPE => UploadJob::class,
    ];

    public function __construct(
        private readonly Queue          $queue,
        private readonly StorageService $storage
    ) {}

    public function run(int $limit = 15): array {
        $this->queue->releaseStuck();
        $processed = $failed = 0;

        for ($i = 0; $i < $limit; $i++) {
            $job = $this->queue->reserve();
            if (!$job) break;

            $ok = $this->process($job);
            $ok ? $processed++ : $failed++;
        }

        return ['processed' => $processed, 'failed' => $failed];
    }

    private function process(object $jobRow): bool {
        $payload = json_decode($jobRow->payload, true) ?: [];
        $class   = self::JOB_MAP[$jobRow->type] ?? null;

        if (!$class) {
            $this->queue->fail((int) $jobRow->id, "Unknown job type: {$jobRow->type}");
            return false;
        }

        try {
            $fileRepo = new FileRepository();
            $instance = new $class($payload, $this->storage, $fileRepo);
            $instance->handle();
            $this->queue->complete((int) $jobRow->id);
            return true;
        } catch (RetryableException $e) {
            $delay = $e->getRetryDelay();
            $this->queue->fail((int) $jobRow->id, $e->getMessage(), $delay);
            return false;
        } catch (\Throwable $e) {
            $this->queue->fail((int) $jobRow->id, $e->getMessage(), 0);
            return false;
        }
    }
}
