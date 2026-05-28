<?php

namespace CMM\Adapters;

use CMM\Http\AwsSignatureV4;

class BackblazeB2Adapter implements AdapterInterface {
    private AwsSignatureV4 $signer;
    private string $region;

    public function __construct(private readonly array $creds) {
        preg_match('/s3\.([^.]+)\.backblazeb2\.com/', $creds['endpoint'] ?? '', $m);
        $this->region = $m[1] ?? 'us-west-002';
        $this->signer = new AwsSignatureV4($creds['key_id'], $creds['application_key'], $this->region);
    }

    private function baseUrl(): string {
        return 'https://' . ltrim($this->creds['endpoint'] ?? "s3.{$this->region}.backblazeb2.com", 'https://');
    }

    public function upload(string $localPath, string $remotePath, string $mimeType): string {
        $body    = file_get_contents($localPath);
        $url     = "{$this->baseUrl()}/{$this->creds['bucket']}/$remotePath";
        $headers = $this->signer->sign('PUT', $url, ['content-type' => $mimeType], $body);
        $headers['Content-Type'] = $mimeType;
        $response = wp_remote_request($url, ['method' => 'PUT', 'headers' => $headers, 'body' => $body, 'timeout' => 120]);
        $this->assertOk($response, 'B2 upload');
        return $this->getUrl($remotePath);
    }

    public function delete(string $remotePath): bool {
        $url      = "{$this->baseUrl()}/{$this->creds['bucket']}/$remotePath";
        $headers  = $this->signer->sign('DELETE', $url);
        $response = wp_remote_request($url, ['method' => 'DELETE', 'headers' => $headers, 'timeout' => 30]);
        $code     = wp_remote_retrieve_response_code($response);
        return $code === 204 || $code === 200;
    }

    public function exists(string $remotePath): bool {
        $url      = "{$this->baseUrl()}/{$this->creds['bucket']}/$remotePath";
        $headers  = $this->signer->sign('HEAD', $url);
        $response = wp_remote_request($url, ['method' => 'HEAD', 'headers' => $headers, 'timeout' => 15]);
        return wp_remote_retrieve_response_code($response) === 200;
    }

    public function getUrl(string $remotePath): string {
        if (!empty($this->creds['cdn_domain'])) {
            return rtrim($this->creds['cdn_domain'], '/') . '/' . $remotePath;
        }
        return "{$this->baseUrl()}/{$this->creds['bucket']}/$remotePath";
    }

    public function ping(): bool {
        $url      = "{$this->baseUrl()}/{$this->creds['bucket']}?list-type=2&max-keys=1";
        $headers  = $this->signer->sign('GET', $url);
        $response = wp_remote_get($url, ['headers' => $headers, 'timeout' => 10]);
        return !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    }

    private function assertOk(mixed $response, string $ctx): void {
        if (is_wp_error($response)) throw new \RuntimeException("$ctx: " . $response->get_error_message());
        $code = wp_remote_retrieve_response_code($response);
        if ($code < 200 || $code >= 300) throw new \RuntimeException("$ctx HTTP $code");
    }
}
