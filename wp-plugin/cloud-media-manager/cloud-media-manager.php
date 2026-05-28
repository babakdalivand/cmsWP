<?php
/**
 * Plugin Name: Cloud Media Manager
 * Plugin URI:  https://github.com/PersianAtheists/cmsWP
 * Description: Multi-cloud media storage (R2, S3, B2, Google Drive) with JWT sync, queue, and multisite support.
 * Version:     1.0.0
 * Author:      RAHA Team
 * Requires PHP: 8.1
 * Requires at least: 6.0
 * Text Domain: cloud-media-manager
 */

defined('ABSPATH') || exit;

define('CMM_VERSION',  '1.0.0');
define('CMM_FILE',     __FILE__);
define('CMM_DIR',      plugin_dir_path(__FILE__));
define('CMM_URL',      plugin_dir_url(__FILE__));
define('CMM_SLUG',     'cloud-media-manager');

require_once CMM_DIR . 'src/Container.php';
require_once CMM_DIR . 'src/Plugin.php';
require_once CMM_DIR . 'database/Schema.php';

function cmm_plugin(): \CMM\Plugin {
    static $instance;
    if (!$instance) {
        $instance = new \CMM\Plugin();
    }
    return $instance;
}

add_action('plugins_loaded', function () {
    cmm_plugin()->boot();
});

register_activation_hook(__FILE__, function () {
    // Load all src files manually so activation runs without boot()
    foreach (glob(CMM_DIR . 'database/*.php') ?: [] as $f) require_once $f;
    $dirs = ['Security','Http','Adapters','Repository','Services','Api','Api/Endpoints',
             'Admin','Admin/Ajax','Queue','Queue/Jobs','Cron','Cli/Commands','Multisite'];
    foreach ($dirs as $d) {
        foreach (glob(CMM_DIR . "src/$d/*.php") ?: [] as $f) require_once $f;
    }
    \CMM\Database\Schema::install();
    ( new \CMM\Cron\CronRegistrar() )->scheduleAll();
});

register_deactivation_hook(__FILE__, function () {
    ( new \CMM\Cron\CronRegistrar() )->unscheduleAll();
});
