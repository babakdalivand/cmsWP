<?php

namespace CMM\Admin\Ajax;

use CMM\Container;

class AjaxRegistrar {
    private array $handlers = [
        'cmm_get_status'        => [StatusAjax::class,   'getStatus'],
        'cmm_save_provider'     => [ProviderAjax::class,  'save'],
        'cmm_delete_provider'   => [ProviderAjax::class,  'delete'],
        'cmm_test_provider'     => [ProviderAjax::class,  'testConnection'],
        'cmm_set_default'       => [ProviderAjax::class,  'setDefault'],
        'cmm_list_providers'    => [ProviderAjax::class,  'list'],
        'cmm_list_files'        => [FileAjax::class,      'listFiles'],
        'cmm_delete_files'      => [FileAjax::class,      'deleteFiles'],
        'cmm_resync_files'      => [FileAjax::class,      'resyncFiles'],
        'cmm_save_settings'     => [SettingsAjax::class,  'save'],
        'cmm_get_settings'      => [SettingsAjax::class,  'get'],
        'cmm_network_stats'     => [StatusAjax::class,    'networkStats'],
        'cmm_broadcast_config'  => [SettingsAjax::class,  'broadcastConfig'],
    ];

    public function __construct(private readonly Container $container) {}

    public function register(): void {
        foreach ($this->handlers as $action => [$class, $method]) {
            add_action("wp_ajax_$action", function () use ($class, $method) {
                $this->dispatch($class, $method);
            });
        }
    }

    private function dispatch(string $class, string $method): void {
        if (!check_ajax_referer('cmm_admin', 'nonce', false)) {
            wp_send_json_error(['message' => 'Invalid nonce'], 403);
        }
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Insufficient permissions'], 403);
        }
        $instance = new $class($this->container);
        $instance->$method();
    }
}
