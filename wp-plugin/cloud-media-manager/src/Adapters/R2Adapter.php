<?php

namespace CMM\Adapters;

use CMM\Http\AwsSignatureV4;

class R2Adapter implements AdapterInterface {
    private string $endpoint;
    private AwsSignatureV4 $signer;

    public function __construct(private readonly array $creds) {
        $this->endpoint = "https://{$creds['account_id']}.r2.cloudflarestorage.com";
        $this->signer   = new AwsSignatureV4(
            $creds['access_key_id'],
            $creds['secret_access_key'],
            'auto', 's3'
        );
    }

    public function upload(string $localPath, string $remotePath, string $mimeType): string {
        $body    = file_get_contents($localPath);
        $url     = "{$this->endpoint}/{$this->creds['bucket']}/$remotePath";
        $headers = $this->signer->sign('PUT', $url, ['content-type' => $mimeType], $body);
        $headers['Content-Type'] = $mimeType;

        $response = wp_remote_request($url, [
            'method'  => 'PUT',
            'headers' => $headers,
            'body'    => $body,
            'timeout' => 120,
        ]);
        $this->assertOk($response, 'R2 upload');
        return $this->getUrl($remotePath);
    }

    public function delete(string $remotePath): bool {
        $url     = "{$this->endpoint}/{$this->creds['bucket']}/$remotePath";
        $headers = $this->signer->sign('DELETE', $url);
        $response = wp_remote_request($url, [
            'method'  => 'DELETE',
            'headers' => $headers,
            'timeout' => 30,
        ]);
        $code = wp_remote_retrieve_response_code($response);
        return $code === 204 || $code === 200;
    }

    public function exists(string $remotePath): bool {
        $url      = "{$this->endpoint}/{$this->creds['bucket']}/$remotePath";
        $headers  = $this->signer->sign('HEAD', $url);
        $response = wp_remote_request($url, [
            'method'  => 'HEAD',
            'headers' => $headers,
            'timeout' => 15,
        ]);
        return wp_remote_retrieve_response_code($response) === 200;
    }

    public function getUrl(string $remotePath): string {
        if (!empty($this->creds['public_domain'])) {
            return rtrim($this->creds['public_domain'], '/') . '/' . $remotePath;
        }
        return "{$this->endpoint}/{$this->creds['bucket']}/$remotePath";
    }

    public function ping(): bool {
        $url      = "{$this->endpoint}/{$this->creds['bucket']}?list-type=2&max-keys=1";
        $headers  = $this->signer->sign('GET', $url);
        $response = wp_remote_get($url, ['headers' => $headers, 'timeout' => 10]);
        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    }

    private function assertOk(mixed $response, string $context): void {
        if (is_wp_error($response)) {
            throw new \RuntimeException("$context WP error: " . $response->get_error_message());
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 300) {
            throw new \RuntimeException("$context HTTP $code: " . wp_remote_retrieve_body($response));
        }
    }
}
