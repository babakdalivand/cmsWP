<?php

namespace CMM\Adapters;

class LocalAdapter implements AdapterInterface {
    private string $basePath;
    private string $baseUrl;

    public function __construct(array $creds = []) {
        $upload       = wp_upload_dir();
        $this->basePath = $creds['base_path'] ?? $upload['basedir'];
        $this->baseUrl  = $creds['base_url']  ?? $upload['baseurl'];
    }

    public function upload(string $localPath, string $remotePath, string $mimeType): string {
        $dest = $this->basePath . '/' . $remotePath;
        wp_mkdir_p(dirname($dest));
        copy($localPath, $dest);
        return $this->getUrl($remotePath);
    }

    public function delete(string $remotePath): bool {
        $path = $this->basePath . '/' . $remotePath;
        return file_exists($path) && unlink($path);
    }

    public function exists(string $remotePath): bool {
        return file_exists($this->basePath . '/' . $remotePath);
    }

    public function getUrl(string $remotePath): string {
        return $this->baseUrl . '/' . $remotePath;
    }

    public function ping(): bool {
        return is_writable($this->basePath);
    }
}
