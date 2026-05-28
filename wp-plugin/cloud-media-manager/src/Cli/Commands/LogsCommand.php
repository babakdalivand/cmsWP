<?php

namespace CMM\Cli\Commands;

use WP_CLI;
use CMM\Repository\LogRepository;

class LogsCommand {
    /**
     * View plugin logs.
     *
     * ## OPTIONS
     *
     * [--level=<level>]
     * : Filter by level: info, warn, error.
     *
     * [--limit=<n>]
     * : Number of entries. Default 50.
     *
     * [--follow]
     * : Stream new log entries (tail -f mode).
     */
    public function __invoke(array $args, array $assoc): void {
        $level  = $assoc['level']  ?? null;
        $limit  = (int) ($assoc['limit'] ?? 50);
        $follow = isset($assoc['follow']);
        $repo   = cmm_plugin()->getContainer()->make(LogRepository::class);

        $filters = array_filter(['level' => $level]);
        $logs    = $repo->paginate(1, $limit, $filters);
        $lastId  = 0;

        foreach (array_reverse($logs) as $log) {
            $this->printLog($log);
            $lastId = max($lastId, (int) $log->id);
        }

        if (!$follow) return;

        while (true) {
            sleep(2);
            $new = $repo->paginate(1, 100, array_merge($filters, ['since' => $lastId]));
            foreach (array_reverse($new) as $log) {
                $this->printLog($log);
                $lastId = max($lastId, (int) $log->id);
            }
        }
    }

    private function printLog(object $log): void {
        $level   = strtoupper($log->level);
        $colored = match ($log->level) {
            'error' => WP_CLI::colorize("%R[$level]%n"),
            'warn'  => WP_CLI::colorize("%Y[$level]%n"),
            default => WP_CLI::colorize("%G[$level]%n"),
        };
        WP_CLI::log("$log->created_at $colored $log->message");
    }
}
