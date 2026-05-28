<?php

namespace CMM\Multisite;

use CMM\Security\CredentialEncryptor;

class NetworkBroadcast {
    private SiteSwitcher $switcher;

    private const CONFIG_KEYS = ['auto_upload', 'delete_local', 'filter_mimes', 'min_file_size'];

    public function __construct() {
        $this->switcher = new SiteSwitcher();
    }

    public function broadcastConfig(array $config): void {
        $allowed = array_intersect_key($config, array_flip(self::CONFIG_KEYS));
        $this->switcher->runOnAllSites(function () use ($allowed) {
            $current = get_option('cmm_settings', []);
            update_option('cmm_settings', array_merge($current, $allowed));
        });
    }

    public function broadcastProvider(array $providerData): void {
        $this->switcher->runOnAllSites(function () use ($providerData) {
            $salt = defined('AUTH_SALT') ? AUTH_SALT : wp_generate_uuid4();
            $key  = substr(hash('sha256', $salt . get_site_url(), true), 0, 32);
            $enc  = new CredentialEncryptor($key);

            $creds = $enc->encryptArray($providerData['credentials'] ?? []);
            global $wpdb;
            $wpdb->insert("{$wpdb->prefix}cmm_providers", [
                'name'        => sanitize_text_field($providerData['name'] ?? ''),
                'type'        => sanitize_key($providerData['type'] ?? ''),
                'credentials' => json_encode($creds),
                'is_active'   => 1,
                'is_default'  => 0,
            ]);
        });
    }

    public function broadcastMigration(array $options = []): void {
        $this->switcher->runOnAllSites(function () use ($options) {
            global $wpdb;
            $rows = $wpdb->get_results("SELECT ID FROM {$wpdb->prefix}posts WHERE post_type='attachment' AND post_status='inherit' LIMIT 200");
            $queue = cmm_plugin()->getContainer()->make(\CMM\Queue\Queue::class);
            foreach ($rows as $row) {
                $path = get_attached_file((int) $row->ID);
                if ($path && file_exists($path)) {
                    $queue->dispatch(\CMM\Queue\Jobs\UploadJob::class, [
                        'file_path' => $path,
                        'post_id'   => $row->ID,
                        'mime_type' => get_post_mime_type((int) $row->ID),
                    ]);
                }
            }
        });
    }

    public function registerSite(int $blogId, string $siteKey, string $cmswpUrl): void {
        $this->switcher->runOnSite($blogId, function () use ($siteKey, $cmswpUrl) {
            update_option('cmm_site_key',   $siteKey);
            update_option('cmm_cmswp_url',  $cmswpUrl);
        });
    }
}
