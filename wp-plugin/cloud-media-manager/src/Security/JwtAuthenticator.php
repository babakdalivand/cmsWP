<?php

namespace CMM\Security;

class JwtAuthenticator {
    private const ROUTE_PREFIX = '/wp-json/cmm/v1';

    public function register(): void {
        add_filter('rest_authentication_errors', [$this, 'authenticate'], 1);
    }

    public function authenticate(mixed $result): mixed {
        if (!str_contains($_SERVER['REQUEST_URI'] ?? '', self::ROUTE_PREFIX)) {
            return $result;
        }

        // اگر قبلاً توسط فیلتر دیگری تأیید شده، بپذیر
        if ($result === true) {
            return true;
        }

        $token = $this->extractToken();
        if ($token === null) {
            return new \WP_Error('cmm_auth_missing', 'Authorization token required.', ['status' => 401]);
        }
        return $this->validateToken($token);
    }

    private function extractToken(): ?string {
        // اول هدر اختصاصی X-CMM-Token را بررسی کن
        $custom = $_SERVER['HTTP_X_CMM_TOKEN'] ?? '';
        if ($custom !== '') {
            return $custom;
        }
        // fallback: Authorization: Bearer ...
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return null;
    }

    private function validateToken(string $token): mixed {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return new \WP_Error('cmm_auth_invalid', 'Invalid token format.', ['status' => 401]);
        }
        [$headerB64, $payloadB64, $sigB64] = $parts;

        $header  = json_decode(base64_decode(strtr($headerB64, '-_', '+/')), true);
        $payload = json_decode(base64_decode(strtr($payloadB64, '-_', '+/')), true);

        if (($header['alg'] ?? '') !== 'HS256') {
            return new \WP_Error('cmm_auth_alg', 'Unsupported algorithm.', ['status' => 401]);
        }
        if (($payload['exp'] ?? 0) < time()) {
            return new \WP_Error('cmm_auth_expired', 'Token expired.', ['status' => 401]);
        }
        if (($payload['aud'] ?? '') !== get_site_url()) {
            return new \WP_Error('cmm_auth_aud', 'Invalid audience.', ['status' => 401]);
        }

        $siteKey = get_option('cmm_site_key', '');
        if (empty($siteKey)) {
            return new \WP_Error('cmm_auth_nokey', 'Site key not configured.', ['status' => 503]);
        }

        $expected = hash_hmac('sha256', "$headerB64.$payloadB64", $siteKey, true);
        $received = base64_decode(strtr($sigB64, '-_', '+/'));

        if (!hash_equals($expected, $received)) {
            return new \WP_Error('cmm_auth_sig', 'Invalid signature.', ['status' => 401]);
        }

        return true;
    }

    public function generateToken(string $siteKey, string $issuer, string $audience, int $ttl = 300): string {
        $header  = base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = base64_encode(json_encode([
            'iss' => $issuer,
            'aud' => $audience,
            'iat' => time(),
            'exp' => time() + $ttl,
        ]));
        $header  = strtr($header, '+/', '-_');
        $payload = strtr($payload, '+/', '-_');
        $sig     = strtr(base64_encode(hash_hmac('sha256', "$header.$payload", $siteKey, true)), '+/', '-_');
        return "$header.$payload.$sig";
    }
}
