<?php

namespace CMM\Security;

class CredentialEncryptor {
    public function __construct(private readonly string $key) {}

    public function encrypt(string $plaintext): string {
        $iv         = random_bytes(12);
        $tag        = '';
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ciphertext === false) {
            throw new \RuntimeException('Encryption failed.');
        }
        return base64_encode($iv . $tag . $ciphertext);
    }

    public function decrypt(string $ciphertext): string {
        $raw       = base64_decode($ciphertext);
        $iv        = substr($raw, 0, 12);
        $tag       = substr($raw, 12, 16);
        $encrypted = substr($raw, 28);
        $plaintext = openssl_decrypt($encrypted, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($plaintext === false) {
            throw new \RuntimeException('Decryption failed.');
        }
        return $plaintext;
    }

    public function encryptArray(array $data): array {
        $encrypted = [];
        foreach ($data as $k => $v) {
            $encrypted[$k] = $this->encrypt((string) $v);
        }
        return $encrypted;
    }

    public function decryptArray(array $data): array {
        $decrypted = [];
        foreach ($data as $k => $v) {
            try {
                $decrypted[$k] = $this->decrypt((string) $v);
            } catch (\RuntimeException) {
                $decrypted[$k] = $v;
            }
        }
        return $decrypted;
    }
}
