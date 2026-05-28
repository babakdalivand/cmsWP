/* Dashboard status polling */
(function ($) {
    'use strict';

    function loadStatus() {
        cmm.req('cmm_get_status').done(function (r) {
            if (!r.success) return;
            renderStatus(r.data);
        });
    }

    function renderStatus(data) {
        var f = data.files || {};
        $('#stat-total').text(data.total || 0);
        $('#stat-synced').text(f.synced || 0);
        $('#stat-pending').text(f.pending || 0);
        $('#stat-failed').text(f.failed || 0);

        var $ph = $('#cmm-provider-health').empty();
        (data.providers || []).forEach(function (p) {
            var dot  = p.healthy === true ? 'ok' : (p.healthy === false ? 'fail' : '');
            var badge = p.default ? ' <strong>(default)</strong>' : '';
            $ph.append('<div class="cmm-provider-row"><span class="cmm-dot ' + dot + '"></span><span>' + p.name + ' <em>(' + p.type + ')</em>' + badge + '</span></div>');
        });

        var q = data.queue || {};
        $('#q-pending').text(q.pending || 0);
        $('#q-processing').text(q.processing || 0);
        $('#q-failed').text(q.failed || 0);
    }

    function startPolling(interval) {
        loadStatus();
        setInterval(loadStatus, interval || 30000);
    }

    $(document).ready(startPolling);
}(jQuery));
