<?php

namespace CMM\Admin;

use CMM\Container;

class AdminRegistrar {
    public function __construct(private readonly Container $container) {}

    public function register(): void {
        if (!is_admin()) return;
        add_action('admin_menu',             [$this, 'addMenus']);
        add_action('admin_enqueue_scripts',  [$this, 'enqueueAssets']);
    }

    public function addMenus(): void {
        add_menu_page(
            'Cloud Media Manager', 'Cloud Media',
            'manage_options', 'cloud-media-manager',
            [$this, 'renderDashboard'],
            'dashicons-cloud-upload', 80
        );
        add_submenu_page('cloud-media-manager', 'Providers', 'Providers',    'manage_options', 'cmm-providers', [$this, 'renderProviders']);
        add_submenu_page('cloud-media-manager', 'Files',     'Files',         'manage_options', 'cmm-files',     [$this, 'renderFiles']);
        add_submenu_page('cloud-media-manager', 'Settings',  'Settings',      'manage_options', 'cmm-settings',  [$this, 'renderSettings']);
        add_submenu_page('cloud-media-manager', 'Logs',      'Logs',          'manage_options', 'cmm-logs',      [$this, 'renderLogs']);
    }

    public function enqueueAssets(string $hook): void {
        if (!str_contains($hook, 'cloud-media')) return;
        wp_enqueue_style('cmm-admin', CMM_URL . 'assets/css/admin.css', [], CMM_VERSION);
        wp_enqueue_script('cmm-admin', CMM_URL . 'assets/js/admin.js', ['jquery'], CMM_VERSION, true);
        wp_localize_script('cmm-admin', 'CMM', [
            'nonce'   => wp_create_nonce('cmm_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ]);

        $page = $_GET['page'] ?? '';
        if ($page === 'cloud-media-manager') {
            wp_enqueue_script('cmm-status',    CMM_URL . 'assets/js/status.js',    ['cmm-admin'], CMM_VERSION, true);
        }
        if ($page === 'cmm-providers') {
            wp_enqueue_script('cmm-providers', CMM_URL . 'assets/js/providers.js', ['cmm-admin'], CMM_VERSION, true);
        }
        if ($page === 'cmm-files') {
            wp_enqueue_script('cmm-files',     CMM_URL . 'assets/js/files.js',     ['cmm-admin'], CMM_VERSION, true);
        }
    }

    public function renderDashboard(): void { $this->template('dashboard'); }
    public function renderProviders(): void { $this->template('providers'); }
    public function renderFiles(): void     { $this->template('files'); }
    public function renderSettings(): void  { $this->template('settings'); }
    public function renderLogs(): void      { $this->template('logs'); }

    private function template(string $name): void {
        $file = CMM_DIR . "templates/admin/$name.php";
        if (file_exists($file)) include $file;
    }
}
