<?php
defined('ABSPATH') || exit;
$settings = get_option('cmm_settings', []);
$cmswpUrl = get_option('cmm_cmswp_url', '');
$siteKey  = get_option('cmm_site_key', '');
?>
<div class="wrap cmm-wrap">
    <h1>Settings</h1>
    <form id="cmm-settings-form">
        <div class="cmm-settings-section">
            <h2>Upload Routing</h2>
            <table class="form-table">
                <tr>
                    <th>Auto Upload</th>
                    <td><label><input type="checkbox" name="auto_upload" value="1" <?php checked($settings['auto_upload'] ?? '', '1'); ?>> Upload new media automatically</label></td>
                </tr>
                <tr>
                    <th>Delete Local</th>
                    <td><label><input type="checkbox" name="delete_local" value="1" <?php checked($settings['delete_local'] ?? '', '1'); ?>> Remove local file after successful upload</label></td>
                </tr>
                <tr>
                    <th>Min File Size (bytes)</th>
                    <td><input type="number" name="min_file_size" value="<?php echo esc_attr($settings['min_file_size'] ?? '0'); ?>" min="0"></td>
                </tr>
            </table>
        </div>

        <div class="cmm-settings-section">
            <h2>cmsWP Integration</h2>
            <table class="form-table">
                <tr>
                    <th>cmsWP URL</th>
                    <td><input type="url" name="cmswp_url" value="<?php echo esc_attr($cmswpUrl); ?>" class="regular-text" placeholder="https://cms.example.com"></td>
                </tr>
                <tr>
                    <th>Site Key (JWT)</th>
                    <td><input type="text" name="site_key" value="<?php echo esc_attr($siteKey); ?>" class="regular-text" placeholder="Shared secret with cmsWP"></td>
                </tr>
            </table>
        </div>

        <div class="cmm-settings-sticky-save">
            <button type="submit" class="button button-primary">Save Settings</button>
        </div>
    </form>
</div>
