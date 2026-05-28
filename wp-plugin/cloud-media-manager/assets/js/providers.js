/* Providers page JS */
(function ($) {
    'use strict';

    function loadProviders() {
        cmm.req('cmm_list_providers').done(function (r) {
            if (!r.success) return;
            var $list = $('#cmm-providers-list').empty();
            if (!r.data.length) { $list.html('<p>No providers yet.</p>'); return; }
            r.data.forEach(function (p) {
                var health = p.last_ping_ok === '1' ? '<span class="cmm-dot ok"></span>' : (p.last_ping_ok === '0' ? '<span class="cmm-dot fail"></span>' : '<span class="cmm-dot"></span>');
                var row = $('<div class="cmm-provider-row" data-id="' + p.id + '">'
                    + health
                    + '<strong>' + p.name + '</strong>'
                    + ' <em class="cmm-badge">' + p.type.toUpperCase() + '</em>'
                    + (p.is_default == 1 ? ' <span class="cmm-badge cmm-badge-synced">Default</span>' : '')
                    + '<div style="margin-left:auto;display:flex;gap:6px;">'
                    + '<button class="button button-small cmm-edit-provider">Edit</button>'
                    + '<button class="button button-small cmm-test-provider">Test</button>'
                    + (!p.is_default ? '<button class="button button-small cmm-set-default">Set Default</button>' : '')
                    + '<button class="button button-small cmm-danger cmm-del-provider">Delete</button>'
                    + '</div></div>');
                $list.append(row);
            });
        });
    }

    // Show/hide credential sections
    function switchType(type) {
        $('.cmm-creds-section').addClass('cmm-hidden');
        $('#cmm-creds-' + type).removeClass('cmm-hidden');
    }

    $(document).on('change', '#cmm-provider-type', function () { switchType($(this).val()); });

    $(document).on('click', '.cmm-btn-add-provider', function () {
        $('#cmm-provider-form')[0].reset();
        $('#cmm-provider-id').val('');
        $('#cmm-form-title').text('Add Provider');
        switchType('r2');
        $('#cmm-provider-form-modal').removeClass('cmm-hidden');
    });

    $(document).on('click', '.cmm-edit-provider', function () {
        var id = $(this).closest('[data-id]').data('id');
        cmm.req('cmm_list_providers').done(function (r) {
            var p = (r.data || []).find(function (x) { return x.id == id; });
            if (!p) return;
            $('#cmm-provider-id').val(p.id);
            $('#cmm-provider-name').val(p.name);
            $('#cmm-provider-type').val(p.type).trigger('change');
            $('#cmm-form-title').text('Edit Provider');
            $('#cmm-provider-form-modal').removeClass('cmm-hidden');
        });
    });

    $(document).on('submit', '#cmm-provider-form', function (e) {
        e.preventDefault();
        var data = { id: $('#cmm-provider-id').val(), name: $('#cmm-provider-name').val(), type: $('#cmm-provider-type').val() };
        var type = data.type;
        $('#cmm-creds-' + type + ' [data-cred]').each(function () {
            var el = $(this);
            var key = el.data('cred');
            data['credentials[' + key + ']'] = el.is(':checkbox') ? (el.is(':checked') ? '1' : '0') : el.val();
        });
        cmm.req('cmm_save_provider', data).done(function (r) {
            if (r.success) {
                cmm.notify('Provider saved.', 'success');
                $('#cmm-provider-form-modal').addClass('cmm-hidden');
                loadProviders();
            } else {
                cmm.notify('Error: ' + (r.data && r.data.message), 'error');
            }
        });
    });

    $(document).on('click', '.cmm-del-provider', function () {
        var id = $(this).closest('[data-id]').data('id');
        cmm.confirm('Delete this provider?', function () {
            cmm.req('cmm_delete_provider', { id: id }).done(function () {
                cmm.notify('Provider deleted.', 'success');
                loadProviders();
            });
        });
    });

    $(document).on('click', '.cmm-test-provider, .cmm-btn-test', function () {
        var id = $(this).closest('[data-id]').data('id') || $('#cmm-provider-id').val();
        if (!id) { cmm.notify('Save the provider first.', 'error'); return; }
        cmm.req('cmm_test_provider', { id: id }).done(function (r) {
            cmm.notify(r.success ? 'Connection successful!' : 'Connection failed.', r.success ? 'success' : 'error');
        });
    });

    $(document).on('click', '.cmm-set-default', function () {
        var id = $(this).closest('[data-id]').data('id');
        cmm.req('cmm_set_default', { id: id }).done(function () {
            cmm.notify('Default provider updated.', 'success');
            loadProviders();
        });
    });

    $(document).ready(function () {
        loadProviders();
        switchType('r2');
    });
}(jQuery));
