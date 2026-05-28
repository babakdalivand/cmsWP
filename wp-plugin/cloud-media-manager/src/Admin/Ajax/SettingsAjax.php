<?php

namespace CMM\Admin\Ajax;

use CMM\Container;

class SettingsAjax {
    private const ALLOWED = ['auto_upload', 'delete_local', 'filter_mimes', 'min_file_size'];

    public function __construct(private readonly Container $container) {}

    public function get(): void {
        wp_send_json_success(get_option('cmm_settings', []));
    }

    public function save(): void {
        $current = get_option('cmm_settings', []);
        foreach (self::ALLOWED as $key) {
            if (isset($_POST[$key])) {
                $current[$key] = sanitize_text_field($_POST[$key]);
            }
        }

        if (isset($_POST['cmswp_url'])) {
            update_option('cmm_cmswp_url', esc_url_raw($_POST['cmswp_url']));
        }
        if (isset($_POST['site_key'])) {
            update_option('cmm_site_key', sanitize_text_field($_POST['site_key']));
        }

        update_option('cmm_settings', $current);
        wp_send_json_success(['saved' => true]);
    }

    public function broadcastConfig(): void {
        if (!is_multisite()) {
            wp_send_json_error(['message' => 'Not a multisite install']);
        }
        $data = $_POST['config'] ?? [];
        if (is_string($data)) {
            $data = json_decode(stripslashes($data), true) ?: [];
        }

        $broadcast = $this->container->make(\CMM\Multisite\NetworkBroadcast::class);
        $broadcast->broadcastConfig($data);
        wp_send_json_success(['broadcast' => true]);
    }
}
