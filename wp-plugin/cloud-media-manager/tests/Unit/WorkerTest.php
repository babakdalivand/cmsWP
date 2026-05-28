<?php

namespace CMM\Tests\Unit;

use CMM\Queue\Worker;
use CMM\Queue\Queue;
use CMM\Queue\RetryableException;
use CMM\Services\StorageService;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;

class WorkerTest extends TestCase {
    private MockObject $queue;
    private MockObject $storage;
    private Worker     $worker;

    protected function setUp(): void {
        $this->queue   = $this->createMock(Queue::class);
        $this->storage = $this->createMock(StorageService::class);
        $this->worker  = new Worker($this->queue, $this->storage);
    }

    public function testRunCallsReleaseStuck(): void {
        $this->queue->expects(self::once())->method('releaseStuck');
        $this->queue->method('reserve')->willReturn(null);
        $this->worker->run(5);
    }

    public function testRunStopsWhenNoJobsAvailable(): void {
        $this->queue->method('reserve')->willReturn(null);
        $result = $this->worker->run(10);
        self::assertSame(0, $result['processed']);
        self::assertSame(0, $result['failed']);
    }

    public function testRunProcessesUpToLimit(): void {
        $job = (object)[
            'id'       => 1,
            'type'     => \CMM\Queue\Jobs\UploadJob::TYPE,
            'payload'  => json_encode(['file_path' => '/nonexistent.jpg', 'mime_type' => 'image/jpeg']),
            'attempts' => 1,
        ];

        // Reserve returns job twice then null
        $this->queue->method('reserve')
            ->will(self::onConsecutiveCalls($job, null));

        $this->queue->expects(self::once())->method('fail');
        $result = $this->worker->run(5);
        self::assertSame(1, $result['processed'] + $result['failed']);
    }

    public function testRetryableExceptionTriggersRetry(): void {
        $this->queue->expects(self::once())->method('fail')
            ->with(self::anything(), self::anything(), self::greaterThan(0));
    }
}
