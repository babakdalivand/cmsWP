<?php

namespace CMM\Api;

use CMM\Services\StorageService;

class RestRegistrar {
    public function __construct(private readonly StorageService $storage) {}

    public function register(): void {
        add_action('rest_api_init', [$this, 'registerRoutes']);
    }

    public function registerRoutes(): void {
        $ns = 'cmm/v1';
        $p  = '__return_true';

        register_rest_route($ns, '/status',                  [['methods' => 'GET',        'callback' => [$this, 'status'],          'permission_callback' => $p]]);
        register_rest_route($ns, '/config',                  [['methods' => 'GET',        'callback' => [$this, 'getConfig'],       'permission_callback' => $p],
                                                              ['methods' => 'POST',       'callback' => [$this, 'setConfig'],       'permission_callback' => $p]]);
        register_rest_route($ns, '/providers',               [['methods' => 'GET',        'callback' => [$this, 'listProviders'],   'permission_callback' => $p],
                                                              ['methods' => 'POST',       'callback' => [$this, 'upsertProvider'],  'permission_callback' => $p]]);
        register_rest_route($ns, '/providers/(?P<id>\d+)',   [['methods' => 'GET',        'callback' => [$this, 'getProvider'],     'permission_callback' => $p],
                                                              ['methods' => 'DELETE',     'callback' => [$this, 'deleteProvider'],  'permission_callback' => $p]]);
        register_rest_route($ns, '/providers/(?P<id>\d+)/default', [['methods' => 'POST','callback' => [$this, 'setDefault'],      'permission_callback' => $p]]);
        register_rest_route($ns, '/sync',                    [['methods' => 'POST',       'callback' => [$this, 'triggerSync'],     'permission_callback' => $p]]);
        register_rest_route($ns, '/logs',                    [['methods' => 'GET',        'callback' => [$this, 'getLogs'],         'permission_callback' => $p]]);
    }

    public function status(\WP_REST_Request $req): \WP_REST_Response {
        global $wpdb;
        $stats = $wpdb->get_results(
            "SELECT status, COUNT(*) as cnt FROM {$wpdb->prefix}cmm_files GROUP BY status"
        ) ?: [];
        $map = ['pending' => 0, 'synced' => 0, 'failed' => 0, 'orphan' => 0];
        foreach ($stats as $row) $map[$row->status] = (int) $row->cnt;

        return rest_ensure_response([
            'site'      => get_site_url(),
            'version'   => CMM_VERSION,
            'files'     => $map,
            'providers' => count(cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class)->active()),
        ]);
    }

    public function getConfig(\WP_REST_Request $req): \WP_REST_Response {
        return rest_ensure_response(get_option('cmm_settings', []));
    }

    public function setConfig(\WP_REST_Request $req): \WP_REST_Response {
        $allowed = ['auto_upload', 'delete_local', 'filter_mimes', 'min_file_size'];
        $data    = array_intersect_key($req->get_json_params(), array_flip($allowed));
        update_option('cmm_settings', $data);
        return rest_ensure_response(['updated' => true]);
    }

    public function listProviders(\WP_REST_Request $req): \WP_REST_Response {
        $repo = cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class);
        return rest_ensure_response($repo->all());
    }

    public function upsertProvider(\WP_REST_Request $req): \WP_REST_Response {
        $body = $req->get_json_params();
        $repo = cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class);
        $creds = $this->storage->encryptCredentials($body['credentials'] ?? []);
        $id   = $repo->save(['name' => sanitize_text_field($body['name'] ?? ''), 'type' => $body['type'], 'credentials' => $creds]);
        return rest_ensure_response(['id' => $id]);
    }

    public function getProvider(\WP_REST_Request $req): \WP_REST_Response {
        $repo     = cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class);
        $provider = $repo->find((int) $req['id']);
        if (!$provider) return new \WP_REST_Response(['error' => 'Not found'], 404);
        return rest_ensure_response($provider);
    }

    public function deleteProvider(\WP_REST_Request $req): \WP_REST_Response {
        $repo = cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class);
        $repo->delete((int) $req['id']);
        return rest_ensure_response(['deleted' => true]);
    }

    public function setDefault(\WP_REST_Request $req): \WP_REST_Response {
        $repo = cmm_plugin()->getContainer()->make(\CMM\Repository\ProviderRepository::class);
        $repo->setDefault((int) $req['id']);
        return rest_ensure_response(['ok' => true]);
    }

    public function triggerSync(\WP_REST_Request $req): \WP_REST_Response {
        $action = sanitize_text_field($req->get_param('action') ?? 'migrate_local');
        $queue  = cmm_plugin()->getContainer()->make(\CMM\Queue\Queue::class);
        $count  = 0;

        if ($action === 'migrate_local') {
            global $wpdb;
            $rows = $wpdb->get_results("SELECT ID, guid FROM {$wpdb->prefix}posts WHERE post_type='attachment' AND post_status='inherit' LIMIT 200");
            foreach ($rows as $row) {
                $path = get_attached_file((int) $row->ID);
                if ($path && file_exists($path)) {
                    $queue->dispatch(\CMM\Queue\Jobs\UploadJob::class, ['file_path' => $path, 'post_id' => $row->ID, 'mime_type' => get_post_mime_type((int) $row->ID)]);
                    $count++;
                }
            }
        }
        return rest_ensure_response(['queued' => $count]);
    }

    public function getLogs(\WP_REST_Request $req): \WP_REST_Response {
        $repo = cmm_plugin()->getContainer()->make(\CMM\Repository\LogRepository::class);
        $logs = $repo->paginate(1, 50, ['level' => $req->get_param('level'), 'since' => $req->get_param('since')]);
        return rest_ensure_response($logs);
    }
}
