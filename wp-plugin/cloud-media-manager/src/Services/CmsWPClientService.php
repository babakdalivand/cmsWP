<?php

namespace CMM\Services;

class CmsWPClientService {
    private function cmswpUrl(): string {
        return rtrim(get_option('cmm_cmswp_url', ''), '/');
    }

    private function siteKey(): string {
        return get_option('cmm_site_key', '');
    }

    private function generateToken(): string {
        $siteKey  = $this->siteKey();
        $issuer   = get_site_url();
        $audience = $this->cmswpUrl();
        $now      = time();

        $header  = strtr(base64_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'])), '+/', '-_');
        $payload = strtr(base64_encode(json_encode([
            'iss' => $issuer,
            'aud' => $audience,
            'iat' => $now,
            'exp' => $now + 300,
        ])), '+/', '-_');
        $sig = strtr(base64_encode(hash_hmac('sha256', "$header.$payload", $siteKey, true)), '+/', '-_');
        return "$header.$payload.$sig";
    }

    public function reportStatus(array $status): bool {
        return $this->post('/api/storage/sites/' . get_current_blog_id() . '/status', $status);
    }

    public function pushLog(array $entry): bool {
        return $this->post('/api/storage/sites/' . get_current_blog_id() . '/logs', $entry);
    }

    public function ping(): bool {
        $url      = $this->cmswpUrl() . '/api/ping';
        $response = wp_remote_get($url, [
            'headers' => ['Authorization' => 'Bearer ' . $this->generateToken()],
            'timeout' => 5,
        ]);
        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    }

    private function post(string $path, array $body): bool {
        $url = $this->cmswpUrl() . $path;
        if (empty($url)) return false;
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->generateToken(),
                'Content-Type'  => 'application/json',
            ],
            'body'    => json_encode($body),
            'timeout' => 10,
        ]);
        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) < 300;
    }
}
