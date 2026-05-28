<?php defined('ABSPATH') || exit; ?>
<div class="wrap cmm-wrap">
    <h1>Logs</h1>
    <div class="cmm-filters">
        <select id="cmm-log-level">
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
        </select>
        <button class="button" id="cmm-log-filter">Filter</button>
    </div>
    <table class="cmm-table wp-list-table widefat fixed striped">
        <thead>
            <tr><th>Time</th><th>Level</th><th>Message</th></tr>
        </thead>
        <tbody id="cmm-logs-tbody"></tbody>
    </table>
    <div id="cmm-logs-pagination"></div>
</div>
<script>
document.addEventListener('DOMContentLoaded', function() {
    function loadLogs() {
        cmm.req('cmm_list_logs', {
            level: document.getElementById('cmm-log-level').value
        }).done(function(r) {
            if (!r.success) return;
            var tb = document.getElementById('cmm-logs-tbody');
            tb.innerHTML = '';
            (r.data || []).forEach(function(l) {
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + l.created_at + '</td><td class="cmm-level-' + l.level + '">' + l.level.toUpperCase() + '</td><td>' + l.message + '</td>';
                tb.appendChild(tr);
            });
        });
    }
    document.getElementById('cmm-log-filter').addEventListener('click', loadLogs);
    loadLogs();
});
</script>
