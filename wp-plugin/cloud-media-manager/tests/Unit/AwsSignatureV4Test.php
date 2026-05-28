<?php

namespace CMM\Tests\Unit;

use CMM\Http\AwsSignatureV4;
use PHPUnit\Framework\TestCase;

class AwsSignatureV4Test extends TestCase {
    private AwsSignatureV4 $signer;

    protected function setUp(): void {
        $this->signer = new AwsSignatureV4('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'us-east-1');
    }

    public function testSignReturnsAuthorizationHeader(): void {
        $headers = $this->signer->sign('GET', 'https://examplebucket.s3.amazonaws.com/test.txt');
        self::assertArrayHasKey('Authorization', $headers);
        self::assertStringStartsWith('AWS4-HMAC-SHA256', $headers['Authorization']);
    }

    public function testSignIncludesAmzDate(): void {
        $headers = $this->signer->sign('PUT', 'https://examplebucket.s3.amazonaws.com/test.txt', [], 'body');
        self::assertArrayHasKey('x-amz-date', $headers);
        self::assertMatchesRegularExpression('/^\d{8}T\d{6}Z$/', $headers['x-amz-date']);
    }

    public function testSignatureIsDeterministicForSameSecond(): void {
        // Two calls in the same second should produce the same date/signature
        // (This is an approximation — both calls happen in same test execution)
        $h1 = $this->signer->sign('GET', 'https://bucket.s3.amazonaws.com/file.txt');
        $h2 = $this->signer->sign('GET', 'https://bucket.s3.amazonaws.com/file.txt');
        self::assertSame($h1['x-amz-date'], $h2['x-amz-date']);
    }

    public function testPresignReturnsUrl(): void {
        $url = $this->signer->presign('https://bucket.s3.amazonaws.com/file.txt', 3600);
        self::assertStringContainsString('X-Amz-Algorithm=AWS4-HMAC-SHA256', $url);
        self::assertStringContainsString('X-Amz-Expires=3600', $url);
        self::assertStringContainsString('X-Amz-Signature=', $url);
    }

    public function testAuthorizationContainsCredentialScope(): void {
        $headers = $this->signer->sign('GET', 'https://bucket.s3.amazonaws.com/file.txt');
        self::assertStringContainsString('AKIAIOSFODNN7EXAMPLE/', $headers['Authorization']);
        self::assertStringContainsString('/us-east-1/s3/aws4_request', $headers['Authorization']);
    }
}
