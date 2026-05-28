<?php

namespace CMM\Admin\Ajax;

use CMM\Container;
use CMM\Repository\ProviderRepository;
use CMM\Services\StorageService;

class ProviderAjax {
    public function __construct(private readonly Container $container) {}

    public function list(): void {
        $repo = $this->container->make(ProviderRepository::class);
        wp_send_json_success($repo->all());
    }

    public function save(): void {
        $id   = (int) ($_POST['id'] ?? 0);
        $name = sanitize_text_field($_POST['name'] ?? '');
        $type = sanitize_key($_POST['type'] ?? '');

        if (!in_array($type, ['r2', 's3', 'b2', 'gdrive', 'local'], true)) {
            wp_send_json_error(['message' => 'Invalid provider type']);
        }

        $rawCreds = [];
        foreach ($_POST['credentials'] ?? [] as $k => $v) {
            $rawCreds[sanitize_key($k)] = sanitize_textarea_field($v);
        }

        $storage = $this->container->make(StorageService::class);
        $repo    = $this->container->make(ProviderRepository::class);

        if ($id) {
            $existing = $repo->find($id);
            if ($existing) {
                $old = $storage->decryptCredentials($existing->credentials);
                foreach ($rawCreds as $k => $v) {
                    if ($v !== '') $old[$k] = $v;
                }
                $rawCreds = $old;
            }
        }

        $creds = $storage->encryptCredentials($rawCreds);

        if ($id) {
            $repo->update($id, ['name' => $name, 'type' => $type, 'credentials' => $creds]);
        } else {
            $id = $repo->save(['name' => $name, 'type' => $type, 'credentials' => $creds]);
        }

        wp_send_json_success(['id' => $id]);
    }

    public function delete(): void {
        $id   = (int) ($_POST['id'] ?? 0);
        $repo = $this->container->make(ProviderRepository::class);
        $repo->delete($id);
        wp_send_json_success();
    }

    public function testConnection(): void {
        $id      = (int) ($_POST['id'] ?? 0);
        $storage = $this->container->make(StorageService::class);
        $ok      = $storage->pingProvider($id);
        $ok ? wp_send_json_success(['message' => 'Connection successful']) : wp_send_json_error(['message' => 'Connection failed']);
    }

    public function setDefault(): void {
        $id   = (int) ($_POST['id'] ?? 0);
        $repo = $this->container->make(ProviderRepository::class);
        $repo->setDefault($id);
        wp_send_json_success();
    }
}
