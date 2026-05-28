<?php

namespace CMM\Tests\Unit;

use CMM\Security\CredentialEncryptor;
use PHPUnit\Framework\TestCase;

class CredentialEncryptorTest extends TestCase {
    private CredentialEncryptor $enc;

    protected function setUp(): void {
        $key       = substr(hash('sha256', 'test-salt' . 'https://example.com', true), 0, 32);
        $this->enc = new CredentialEncryptor($key);
    }

    public function testEncryptDecryptRoundtrip(): void {
        $plain = 'super-secret-key-12345';
        $cipher = $this->enc->encrypt($plain);
        self::assertNotSame($plain, $cipher);
        self::assertSame($plain, $this->enc->decrypt($cipher));
    }

    public function testEncryptProducesDifferentCiphertextEachTime(): void {
        $plain = 'same-plaintext';
        self::assertNotSame($this->enc->encrypt($plain), $this->enc->encrypt($plain));
    }

    public function testEncryptArray(): void {
        $data = ['key' => 'value', 'secret' => 'pass'];
        $enc  = $this->enc->encryptArray($data);
        self::assertArrayHasKey('key', $enc);
        self::assertNotSame($data['key'], $enc['key']);
        $dec  = $this->enc->decryptArray($enc);
        self::assertSame($data, $dec);
    }

    public function testDecryptThrowsOnTamperedData(): void {
        $this->expectException(\RuntimeException::class);
        $cipher = $this->enc->encrypt('test');
        $this->enc->decrypt(base64_encode('garbage'));
    }

    public function testDecryptArrayIsLenientOnBadValues(): void {
        $bad = ['key' => 'not-encrypted'];
        $result = $this->enc->decryptArray($bad);
        self::assertSame('not-encrypted', $result['key']);
    }
}
