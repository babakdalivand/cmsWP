<?php

namespace CMM\Tests\Unit;

use CMM\Queue\Queue;
use CMM\Queue\Jobs\UploadJob;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for Queue — uses a mock $wpdb via anonymous class.
 * These tests verify the query-building logic without hitting a real DB.
 */
class QueueTest extends TestCase {
    public function testDispatchInsertsRecord(): void {
        $calls = [];
        $wpdb  = $this->mockWpdb($calls);

        $GLOBALS['wpdb'] = $wpdb;
        $wpdb->prefix    = 'wp_';

        $queue = new Queue();
        $queue->dispatch(UploadJob::class, ['file_path' => '/tmp/test.jpg'], 0, 5);

        self::assertNotEmpty($calls);
        $insertData = $calls[0]['data'];
        self::assertSame(UploadJob::TYPE, $insertData['type']);
        self::assertSame('pending',       $insertData['status']);
        self::assertSame(5,               $insertData['priority']);
    }

    public function testStatsReturnsExpectedKeys(): void {
        $wpdb             = new \stdClass();
        $wpdb->prefix     = 'wp_';
        $wpdb->last_error = '';
        $wpdb->get_results = function () {
            return [
                (object)['status' => 'pending',   'cnt' => '3'],
                (object)['status' => 'completed',  'cnt' => '10'],
            ];
        };
        $GLOBALS['wpdb'] = $wpdb;

        $queue = new Queue();
        $stats = $queue->stats();

        self::assertArrayHasKey('pending',    $stats);
        self::assertArrayHasKey('processing', $stats);
        self::assertArrayHasKey('completed',  $stats);
        self::assertArrayHasKey('failed',     $stats);
        self::assertSame(3, $stats['pending']);
    }

    private function mockWpdb(array &$calls): object {
        return new class($calls) {
            public string $prefix     = 'wp_';
            public int    $insert_id  = 1;
            public string $last_error = '';
            private array &$log;

            public function __construct(array &$log) { $this->log = &$log; }

            public function insert(string $table, array $data): int {
                $this->log[] = ['table' => $table, 'data' => $data];
                return 1;
            }

            public function get_results(string $sql): array { return []; }
            public function prepare(string $sql, ...$args): string { return vsprintf(str_replace('%s','%s', str_replace('%d','%d',$sql)), $args); }
        };
    }
}
