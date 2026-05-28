/* Network dashboard JS */
(function ($) {
    'use strict';

    function loadAllStats() {
        cmm.req('cmm_network_stats').done(function (r) {
            if (!r.success) return;
            var sites = r.data;
            var $grid = $('#cmm-site-cards').empty();
            var totalSites = sites.length, registered = 0, totalFiles = 0, totalSynced = 0;

            sites.forEach(function (site) {
                if (site.registered) registered++;
                totalFiles  += site.total || 0;
                totalSynced += (site.files && site.files.synced) || 0;
                $grid.append(renderSiteCard(site));
            });

            $('#net-sites').text(totalSites);
            $('#net-registered').text(registered);
            $('#net-total').text(totalFiles);
            $('#net-synced').text(totalSynced);
        });
    }

    function renderSiteCard(site) {
        var f      = site.files || {};
        var dotCls = site.health === 'ok' ? 'ok' : (site.health === 'degraded' ? 'fail' : '');
        var pct    = site.total ? Math.round((f.synced || 0) / site.total * 100) : 0;
        return '<div class="cmm-site-card">'
            + '<div class="cmm-site-card-head"><span class="cmm-dot ' + dotCls + '"></span><strong>' + site.name + '</strong>'
            + (site.registered ? ' <span class="cmm-badge cmm-badge-synced">✓</span>' : '') + '</div>'
            + '<div style="font-size:12px;color:#6b7280;">' + site.url + '</div>'
            + '<div style="display:flex;gap:12px;margin-top:10px;">'
            + '<span>📦 ' + (f.synced || 0) + ' synced</span>'
            + '<span>⏳ ' + (f.pending || 0) + ' pending</span>'
            + '<span>❌ ' + (f.failed || 0) + ' failed</span>'
            + '</div>'
            + '<div class="cmm-progress-bar"><div class="cmm-progress-fill" style="width:' + pct + '%"></div></div>'
            + '</div>';
    }

    $(document).on('click', '#cmm-broadcast-config-btn', function () {
        $('#cmm-broadcast-modal').removeClass('cmm-hidden');
    });

    $(document).on('click', '#cmm-broadcast-send', function () {
        var raw = $('#cmm-broadcast-json').val();
        var data;
        try { data = JSON.parse(raw); } catch (e) { cmm.notify('Invalid JSON', 'error'); return; }
        cmm.req('cmm_broadcast_config', { config: JSON.stringify(data) }).done(function (r) {
            cmm.notify(r.success ? 'Config broadcast sent.' : 'Error.', r.success ? 'success' : 'error');
            $('#cmm-broadcast-modal').addClass('cmm-hidden');
        });
    });

    $(document).ready(function () {
        loadAllStats();
        setInterval(loadAllStats, 60000);
    });
}(jQuery));
