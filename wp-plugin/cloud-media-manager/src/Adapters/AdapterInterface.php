<?php

namespace CMM\Adapters;

interface AdapterInterface {
    public function upload(string $localPath, string $remotePath, string $mimeType): string;
    public function delete(string $remotePath): bool;
    public function exists(string $remotePath): bool;
    public function getUrl(string $remotePath): string;
    public function ping(): bool;
}
