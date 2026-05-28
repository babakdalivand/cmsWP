<?php defined('ABSPATH') || exit; ?>
<div class="wrap cmm-wrap">
    <h1>Media Files</h1>
    <div class="cmm-filters">
        <select id="cmm-filter-status">
            <option value="">All Statuses</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="orphan">Orphan</option>
        </select>
        <input type="text" id="cmm-filter-search" placeholder="Search path…">
        <button class="button" id="cmm-filter-apply">Filter</button>
    </div>
    <div class="cmm-bulk-bar cmm-hidden">
        <span id="cmm-selected-count">0</span> selected
        <button class="button button-small" id="cmm-bulk-resync">Re-sync</button>
        <button class="button button-small cmm-danger" id="cmm-bulk-delete">Delete</button>
    </div>
    <table class="cmm-table wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th class="cmm-col-check"><input type="checkbox" id="cmm-select-all"></th>
                <th>File</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Size</th>
                <th>Synced At</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody id="cmm-files-tbody"></tbody>
    </table>
    <div class="cmm-pagination" id="cmm-pagination"></div>
</div>
