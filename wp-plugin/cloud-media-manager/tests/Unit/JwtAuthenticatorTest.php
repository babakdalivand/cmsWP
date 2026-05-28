<?php

namespace CMM\Tests\Unit;

use CMM\Security\JwtAuthenticator;
use PHPUnit\Framework\TestCase;

class JwtAuthenticatorTest extends TestCase {
    private JwtAuthenticator $jwt;
    private string $siteKey = 'test-site-key-1234567890abcdef';

    protected function setUp(): void {
        $this->jwt = new JwtAuthenticator();
    }

    public function testGenerateAndValidTokenStructure(): void {
        $token = $this->jwt->generateToken($this->siteKey, 'https://cmswp.example.com', 'https://example.com');
        $parts = explode('.', $token);
        self::assertCount(3, $parts);
    }

    public function testTokenPayloadContainsExpectedClaims(): void {
        $token   = $this->jwt->generateToken($this->siteKey, 'https://iss.example.com', 'https://aud.example.com', 300);
        $payload = json_decode(base64_decode(strtr(explode('.', $token)[1], '-_', '+/')), true);
        self::assertSame('https://iss.example.com', $payload['iss']);
        self::assertSame('https://aud.example.com', $payload['aud']);
        self::assertGreaterThan(time(), $payload['exp']);
    }

    public function testTokenExpiresCorrectly(): void {
        $token   = $this->jwt->generateToken($this->siteKey, 'a', 'b', 5);
        $payload = json_decode(base64_decode(strtr(explode('.', $token)[1], '-_', '+/')), true);
        self::assertEqualsWithDelta(time() + 5, $payload['exp'], 2);
    }

    public function testHeaderAlgorithmIsHS256(): void {
        $token  = $this->jwt->generateToken($this->siteKey, 'a', 'b');
        $header = json_decode(base64_decode(strtr(explode('.', $token)[0], '-_', '+/')), true);
        self::assertSame('HS256', $header['alg']);
    }

    public function testSignatureIsHmacSha256(): void {
        $token  = $this->jwt->generateToken($this->siteKey, 'a', 'b');
        $parts  = explode('.', $token);
        $expected = hash_hmac('sha256', $parts[0] . '.' . $parts[1], $this->siteKey, true);
        $actual   = base64_decode(strtr($parts[2], '-_', '+/'));
        self::assertTrue(hash_equals($expected, $actual));
    }
}
