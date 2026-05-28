<?php

namespace CMM\Services;

use CMM\Adapters\AdapterInterface;
use CMM\Adapters\R2Adapter;
use CMM\Adapters\S3Adapter;
use CMM\Adapters\BackblazeB2Adapter;
use CMM\Adapters\GoogleDriveAdapter;
use CMM\Adapters\LocalAdapter;
use CMM\Repository\ProviderRepository;
use CMM\Repository\FileRepository;
use CMM\Repository\LogRepository;
use CMM\Security\CredentialEncryptor;

class StorageService {
    public function __construct(
        private readonly ProviderRepository $providers,
        private readonly FileRepository     $files,
        private readonly LogRepository      $logs,
        private readonly CredentialEncryptor $encryptor
    ) {}

    public function uploadFile(string $localPath, string $mimeType, ?int $providerId = null): array {
        $provider = $providerId
            ? $this->providers->find($providerId)
            : $this->providers->default();

        if (!$provider) throw new \RuntimeException('No active provider configured.');

        $adapter    = $this->buildAdapter($provider);
        $remotePath = $this->buildRemotePath($localPath);
        $remoteUrl  = $adapter->upload($localPath, $remotePath, $mimeType);

        $this->logs->info("Uploaded $localPath → $remoteUrl", ['provider' => $provider->id]);
        return ['remote_key' => $remotePath, 'remote_url' => $remoteUrl, 'provider_id' => (int) $provider->id];
    }

    public function deleteFile(string $remoteKey, int $providerId): bool {
        $provider = $this->providers->find($providerId);
        if (!$provider) return false;
        $adapter = $this->buildAdapter($provider);
        return $adapter->delete($remoteKey);
    }

    public function getRemoteUrl(string $remoteKey, int $providerId): string {
        $provider = $this->providers->find($providerId);
        if (!$provider) return '';
        return $this->buildAdapter($provider)->getUrl($remoteKey);
    }

    public function pingProvider(int $providerId): bool {
        $provider = $this->providers->find($providerId);
        if (!$provider) return false;
        try {
            $ok = $this->buildAdapter($provider)->ping();
            $this->providers->updatePingStatus($providerId, $ok);
            return $ok;
        } catch (\Throwable $e) {
            $this->providers->updatePingStatus($providerId, false);
            $this->logs->error("Ping failed provider $providerId: " . $e->getMessage());
            return false;
        }
    }

    public function buildAdapter(object $provider): AdapterInterface {
        $creds = $this->decryptCredentials($provider->credentials);
        return match ($provider->type) {
            'r2'     => new R2Adapter($creds),
            's3'     => new S3Adapter($creds),
            'b2'     => new BackblazeB2Adapter($creds),
            'gdrive' => new GoogleDriveAdapter($creds),
            'local'  => new LocalAdapter($creds),
            default  => throw new \InvalidArgumentException("Unknown provider type: {$provider->type}"),
        };
    }

    public function decryptCredentials(string $json): array {
        $raw = json_decode($json, true) ?: [];
        return $this->encryptor->decryptArray($raw);
    }

    public function encryptCredentials(array $creds): string {
        return json_encode($this->encryptor->encryptArray($creds));
    }

    private function buildRemotePath(string $localPath): string {
        $upload  = wp_upload_dir();
        $baseDir = trailingslashit($upload['basedir']);
        $rel     = str_starts_with($localPath, $baseDir)
            ? substr($localPath, strlen($baseDir))
            : basename($localPath);
        return ltrim(str_replace('\\', '/', $rel), '/');
    }
}
