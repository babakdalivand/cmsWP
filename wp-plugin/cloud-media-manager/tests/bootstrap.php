<?php
/**
 * PHPUnit bootstrap — loads WordPress stubs for unit tests.
 * For integration tests, set WP_TESTS_DIR env var to wp-tests directory.
 */

require_once __DIR__ . '/../vendor/autoload.php';

// WordPress function stubs used by unit tests
if (!function_exists('get_site_url')) {
    function get_site_url(): string { return 'https://example.com'; }
}
if (!function_exists('get_option')) {
    function get_option(string $key, mixed $default = false): mixed { return $default; }
}
if (!function_exists('current_time')) {
    function current_time(string $type, bool $gmt = false): string { return gmdate('Y-m-d H:i:s'); }
}
if (!function_exists('wp_generate_uuid4')) {
    function wp_generate_uuid4(): string { return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', ...array_map(fn() => random_int(0, 0xffff), range(1, 8))); }
}
if (!defined('AUTH_SALT')) {
    define('AUTH_SALT', 'test-salt-for-phpunit-only');
}
if (!defined('CMM_VERSION')) {
    define('CMM_VERSION', '1.0.0-test');
}
if (!defined('CMM_DIR')) {
    define('CMM_DIR', dirname(__DIR__) . '/');
}

// Autoload plugin classes
spl_autoload_register(function (string $class): void {
    $prefix = 'CMM\\';
    if (!str_starts_with($class, $prefix)) return;
    $rel  = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = CMM_DIR . 'src/' . $rel . '.php';
    if (file_exists($file)) require_once $file;
    else {
        $file2 = CMM_DIR . 'database/' . basename($rel) . '.php';
        if (file_exists($file2)) require_once $file2;
    }
});
