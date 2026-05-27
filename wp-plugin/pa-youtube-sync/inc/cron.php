<?php
if ( ! defined('ABSPATH') ) exit;

function pays_schedule_cron(): void {
    if ( ! wp_next_scheduled('pays_sync_event') ) {
        $interval = get_option('pays_sync_interval', 'hourly');
        wp_schedule_event( time(), $interval, 'pays_sync_event' );
    }
}
add_action( 'pays_sync_event', [ 'PAYS_Importer', 'run_sync' ] );

// Reschedule when interval changes
add_action( 'update_option_pays_sync_interval', function( $old, $new ) {
    wp_clear_scheduled_hook('pays_sync_event');
    wp_schedule_event( time(), $new, 'pays_sync_event' );
}, 10, 2 );

// Also refresh live stream cache on cron
add_action( 'pays_sync_event', 'pays_refresh_live_cache' );

function pays_refresh_live_cache(): void {
    $api_key  = get_option('pays_api_key', '');
    $channels = get_option('pays_channels', []);
    if ( ! $api_key || ! $channels ) return;

    $api  = new PAYS_API($api_key);
    $live = [];

    foreach ( $channels as $ch ) {
        if ( empty($ch['enabled']) || empty($ch['show_live']) ) continue;
        $streams = $api->live_streams($ch['id']);
        if ( $streams['live'] || $streams['upcoming'] ) {
            $live[ $ch['id'] ] = [
                'channel_name' => $ch['name'] ?? $ch['id'],
                'live'         => $streams['live'],
                'upcoming'     => $streams['upcoming'],
            ];
        }
    }

    set_transient( 'pays_live_streams', $live, 5 * MINUTE_IN_SECONDS );
}
