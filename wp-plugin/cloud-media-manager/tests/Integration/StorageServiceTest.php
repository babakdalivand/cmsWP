<?php

namespace CMM\Tests\Integration;

use PHPUnit\Framework\TestCase;

/**
 * Integration tests — require a real WordPress installation.
 * Set WP_TESTS_DIR env and run these separately from unit tests.
 *
 * @group integration
 */
class StorageServiceTest extends TestCase {
    public function testSkippedWithoutWordPress(): void {
        if (!defined('ABSPATH')) {
            self::markTestSkipped('Requires WordPress test environment (WP_TESTS_DIR).');
        }
    }

    /**
     * @group integration
     */
    public function testUploadToDefaultProviderAndRecordCreated(): void {
        if (!defined('ABSPATH')) {
            self::markTestSkipped('Requires WordPress test environment.');
        }

        $storage = cmm_plugin()->getContainer()->make(\CMM\Services\StorageService::class);
        $tmpFile = tempnam(sys_get_temp_dir(), 'cmm_test_');
        file_put_contents($tmpFile, str_repeat('A', 1024));

        try {
            $result = $storage->uploadFile($tmpFile, 'application/octet-stream');
            self::assertArrayHasKey('remote_url', $result);
            self::assertNotEmpty($result['remote_url']);
        } finally {
            @unlink($tmpFile);
        }
    }
}
