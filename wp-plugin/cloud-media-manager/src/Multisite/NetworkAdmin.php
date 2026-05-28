<?php

namespace CMM\Multisite;

class NetworkAdmin {
    public function register(): void {
        if (!is_network_admin()) return;
        add_action('network_admin_menu', [$this, 'addMenu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAssets']);

        foreach ([
            'cmm_network_stats'    => 'networkStats',
            'cmm_network_register' => 'registerSite',
            'cmm_network_broadcast'=> 'broadcastConfig',
        ] as $action => $method) {
            add_action("wp_ajax_$action", function () use ($method) {
                if (!check_ajax_referer('cmm_admin', 'nonce', false) || !current_user_can('manage_network')) {
                    wp_send_json_error([], 403);
                }
                $this->$method();
            });
        }
    }

    public function addMenu(): void {
        add_menu_page(
            'Cloud Media Network', 'Cloud Media',
            'manage_network', 'cmm-network',
            [$this, 'render'],
            'dashicons-cloud-upload', 80
        );
    }

    public function enqueueAssets(string $hook): void {
        if (!str_contains($hook, 'cmm-network')) return;
        wp_enqueue_style('cmm-admin',   CMM_URL . 'assets/css/admin.css',   [], CMM_VERSION);
        wp_enqueue_script('cmm-admin',  CMM_URL . 'assets/js/admin.js',     ['jquery'], CMM_VERSION, true);
        wp_enqueue_script('cmm-network',CMM_URL . 'assets/js/network.js',   ['cmm-admin'], CMM_VERSION, true);
        wp_localize_script('cmm-admin', 'CMM', [
            'nonce'   => wp_create_nonce('cmm_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ]);
    }

    public function render(): void {
        include CMM_DIR . 'templates/admin/network-dashboard.php';
    }

    private function networkStats(): void {
        $collector = new NetworkStatsCollector();
        wp_send_json_success($collector->collect());
    }

    private function registerSite(): void {
        $blogId   = (int)  ($_POST['blog_id']   ?? 0);
        $siteKey  = sanitize_text_field($_POST['site_key']  ?? '');
        $cmswpUrl = esc_url_raw($_POST['cmswp_url'] ?? '');
        if (!$blogId || !$siteKey || !$cmswpUrl) {
            wp_send_json_error(['message' => 'Missing parameters']);
        }
        $broadcast = new NetworkBroadcast();
        $broadcast->registerSite($blogId, $siteKey, $cmswpUrl);
        wp_send_json_success();
    }

    private function broadcastConfig(): void {
        $data = $_POST['config'] ?? [];
        if (is_string($data)) $data = json_decode(stripslashes($data), true) ?: [];
        $broadcast = new NetworkBroadcast();
        $broadcast->broadcastConfig($data);
        wp_send_json_success();
    }
}
