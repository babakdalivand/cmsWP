<?php

namespace CMM\Multisite;

class SiteSwitcher {
    public function runOnSite(int $blogId, callable $callback): mixed {
        $needsSwitch = $blogId !== get_current_blog_id();
        if ($needsSwitch) switch_to_blog($blogId);
        try {
            return $callback();
        } finally {
            if ($needsSwitch) restore_current_blog();
        }
    }

    public function runOnAllSites(callable $callback): array {
        $sites   = get_sites(['archived' => 0, 'deleted' => 0, 'spam' => 0, 'number' => 1000]);
        $results = [];
        foreach ($sites as $site) {
            $id = (int) $site->blog_id;
            try {
                $results[$id] = $this->runOnSite($id, $callback);
            } catch (\Throwable $e) {
                $results[$id] = ['error' => $e->getMessage()];
            }
        }
        return $results;
    }
}
