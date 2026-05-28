<?php

namespace CMM\Cron;

class CronRegistrar {
    public function register(): void {
        add_filter('cron_schedules', [$this, 'addSchedules']);
    }

    public function addSchedules(array $schedules): array {
        $schedules['cmm_every_minute'] = [
            'interval' => 60,
            'display'  => 'Every Minute (CMM)',
        ];
        $schedules['cmm_every_5min'] = [
            'interval' => 300,
            'display'  => 'Every 5 Minutes (CMM)',
        ];
        return $schedules;
    }

    public function scheduleAll(): void {
        if (!wp_next_scheduled('cmm_process_queue')) {
            wp_schedule_event(time(), 'cmm_every_minute', 'cmm_process_queue');
        }
        if (!wp_next_scheduled('cmm_prune_jobs')) {
            wp_schedule_event(time(), 'daily', 'cmm_prune_jobs');
        }
        if (!wp_next_scheduled('cmm_health_check')) {
            wp_schedule_event(time(), 'cmm_every_5min', 'cmm_health_check');
        }
    }

    public function unscheduleAll(): void {
        foreach (['cmm_process_queue', 'cmm_prune_jobs', 'cmm_health_check'] as $hook) {
            $ts = wp_next_scheduled($hook);
            if ($ts) wp_unschedule_event($ts, $hook);
        }
    }
}
