<?php

namespace CMM\Multisite;

class NetworkStatsCollector {
    private SiteSwitcher $switcher;

    public function __construct() {
        $this->switcher = new SiteSwitcher();
    }

    public function collect(): array {
        $sites  = get_sites(['archived' => 0, 'deleted' => 0, 'spam' => 0, 'number' => 1000]);
        $result = [];

        foreach ($sites as $site) {
            $blogId = (int) $site->blog_id;
            $data   = $this->switcher->runOnSite($blogId, function () use ($blogId) {
                global $wpdb;
                $stats = $wpdb->get_results(
                    "SELECT status, COUNT(*) as cnt FROM {$wpdb->prefix}cmm_files GROUP BY status"
                ) ?: [];
                $map = ['pending' => 0, 'synced' => 0, 'failed' => 0, 'orphan' => 0];
                foreach ($stats as $row) $map[$row->status] = (int) $row->cnt;

                $health    = get_transient('cmm_health_status') ?: [];
                $anyOk     = !empty($health) && in_array(true, $health, true);
                $anyFail   = in_array(false, $health, true);
                $healthStr = $anyFail ? 'degraded' : ($anyOk ? 'ok' : 'unknown');

                return [
                    'blog_id'    => $blogId,
                    'name'       => get_bloginfo('name'),
                    'url'        => get_site_url(),
                    'registered' => !empty(get_option('cmm_site_key')),
                    'files'      => $map,
                    'total'      => array_sum($map),
                    'health'     => $healthStr,
                ];
            });
            $result[] = $data;
        }

        return $result;
    }
}
