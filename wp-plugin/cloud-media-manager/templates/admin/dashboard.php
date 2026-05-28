<?php defined('ABSPATH') || exit; ?>
<div class="wrap cmm-wrap">
    <h1 class="cmm-page-title"><span class="dashicons dashicons-cloud-upload"></span> Cloud Media Manager</h1>

    <div class="cmm-tabs">
        <a href="#" class="cmm-tab active" data-tab="overview">Overview</a>
        <a href="#" class="cmm-tab" data-tab="activity">Activity</a>
    </div>

    <div class="cmm-tab-content" id="tab-overview">
        <div class="cmm-stats" id="cmm-stats">
            <div class="cmm-stat-card"><span class="cmm-stat-value" id="stat-total">—</span><span class="cmm-stat-label">Total Files</span></div>
            <div class="cmm-stat-card"><span class="cmm-stat-value cmm-green" id="stat-synced">—</span><span class="cmm-stat-label">Synced</span></div>
            <div class="cmm-stat-card"><span class="cmm-stat-value cmm-yellow" id="stat-pending">—</span><span class="cmm-stat-label">Pending</span></div>
            <div class="cmm-stat-card"><span class="cmm-stat-value cmm-red" id="stat-failed">—</span><span class="cmm-stat-label">Failed</span></div>
        </div>

        <div class="cmm-section">
            <h2>Providers</h2>
            <div id="cmm-provider-health"></div>
        </div>

        <div class="cmm-section">
            <h2>Queue</h2>
            <div id="cmm-queue-stats">
                <span id="q-pending">—</span> pending &nbsp;|&nbsp;
                <span id="q-processing">—</span> processing &nbsp;|&nbsp;
                <span id="q-failed">—</span> failed
            </div>
        </div>
    </div>

    <div class="cmm-tab-content cmm-hidden" id="tab-activity">
        <p>Use <a href="<?php echo admin_url('admin.php?page=cmm-logs'); ?>">Logs</a> for detailed activity.</p>
    </div>
</div>
