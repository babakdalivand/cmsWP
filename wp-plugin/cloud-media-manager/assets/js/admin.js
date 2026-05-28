/* Cloud Media Manager — core admin JS */
var cmm = (function ($) {
    'use strict';

    function req(action, data) {
        return $.post(CMM.ajaxUrl, $.extend({ action: action, nonce: CMM.nonce }, data));
    }

    function notify(msg, type, duration) {
        duration = duration || 3000;
        var el = $('<div class="cmm-notify ' + (type || '') + '">' + msg + '</div>');
        $('body').append(el);
        setTimeout(function () { el.fadeOut(200, function () { el.remove(); }); }, duration);
    }

    function confirm(msg, onYes) {
        if (window.confirm(msg)) onYes();
    }

    // Tab navigation
    $(document).on('click', '.cmm-tab', function (e) {
        e.preventDefault();
        var tab = $(this).data('tab');
        $('.cmm-tab').removeClass('active');
        $(this).addClass('active');
        $('.cmm-tab-content').addClass('cmm-hidden');
        $('#tab-' + tab).removeClass('cmm-hidden');
    });

    // Modal close
    $(document).on('click', '.cmm-modal-close', function () {
        $(this).closest('.cmm-modal-overlay').addClass('cmm-hidden');
    });
    $(document).on('click', '.cmm-modal-overlay', function (e) {
        if ($(e.target).is('.cmm-modal-overlay')) $(this).addClass('cmm-hidden');
    });

    // Settings form dirty tracking
    $(document).on('change', '#cmm-settings-form input, #cmm-settings-form select', function () {
        $('.cmm-settings-sticky-save .button').addClass('button-primary');
    });

    // Settings save
    $(document).on('submit', '#cmm-settings-form', function (e) {
        e.preventDefault();
        var data = {};
        $(this).find('[name]').each(function () {
            var el = $(this);
            if (el.is(':checkbox')) {
                data[el.attr('name')] = el.is(':checked') ? '1' : '0';
            } else {
                data[el.attr('name')] = el.val();
            }
        });
        req('cmm_save_settings', data).done(function (r) {
            notify(r.success ? 'Settings saved.' : 'Error saving.', r.success ? 'success' : 'error');
        });
    });

    return { req: req, notify: notify, confirm: confirm };
}(jQuery));
