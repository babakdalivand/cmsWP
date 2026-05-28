<?php defined('ABSPATH') || exit; ?>
<div class="wrap cmm-wrap">
    <h1>Network Media Overview</h1>

    <div class="cmm-stats" id="cmm-network-summary">
        <div class="cmm-stat-card"><span class="cmm-stat-value" id="net-sites">—</span><span class="cmm-stat-label">Sites</span></div>
        <div class="cmm-stat-card"><span class="cmm-stat-value cmm-green" id="net-registered">—</span><span class="cmm-stat-label">Registered</span></div>
        <div class="cmm-stat-card"><span class="cmm-stat-value" id="net-total">—</span><span class="cmm-stat-label">Total Files</span></div>
        <div class="cmm-stat-card"><span class="cmm-stat-value cmm-green" id="net-synced">—</span><span class="cmm-stat-label">Synced</span></div>
    </div>

    <div class="cmm-section">
        <div class="cmm-section-actions">
            <button class="button" id="cmm-broadcast-config-btn">Broadcast Config</button>
            <button class="button" id="cmm-deploy-provider-btn">Deploy Provider</button>
        </div>
        <div id="cmm-site-cards" class="cmm-site-grid"></div>
    </div>

    <!-- Broadcast Config Modal -->
    <div id="cmm-broadcast-modal" class="cmm-modal-overlay cmm-hidden">
        <div class="cmm-modal">
            <h3>Broadcast Config to All Sites</h3>
            <textarea id="cmm-broadcast-json" rows="8" placeholder='{"auto_upload":"1","delete_local":"0"}'></textarea>
            <div class="cmm-form-actions">
                <button class="button button-primary" id="cmm-broadcast-send">Broadcast</button>
                <button class="button cmm-modal-close">Cancel</button>
            </div>
        </div>
    </div>
</div>
