/* Files page JS */
(function ($) {
    'use strict';
    var currentPage  = 1;
    var selectedIds  = new Set();

    function loadFiles(page) {
        currentPage = page || 1;
        cmm.req('cmm_list_files', {
            page:        currentPage,
            per_page:    20,
            status:      $('#cmm-filter-status').val(),
            search:      $('#cmm-filter-search').val(),
        }).done(function (r) {
            if (!r.success) return;
            renderFiles(r.data.files, r.data.total);
        });
    }

    function renderFiles(files, total) {
        var $tb = $('#cmm-files-tbody').empty();
        if (!files.length) { $tb.append('<tr><td colspan="7">No files found.</td></tr>'); return; }
        files.forEach(function (f) {
            var checked = selectedIds.has(f.id) ? 'checked' : '';
            $tb.append(
                '<tr data-id="' + f.id + '">'
                + '<td><input type="checkbox" class="cmm-file-check" ' + checked + '></td>'
                + '<td><a href="' + f.remote_url + '" target="_blank">' + f.local_path.split('/').pop() + '</a></td>'
                + '<td>' + f.provider_id + '</td>'
                + '<td><span class="cmm-badge cmm-badge-' + f.status + '">' + f.status + '</span></td>'
                + '<td>' + formatBytes(f.file_size) + '</td>'
                + '<td>' + (f.synced_at || '—') + '</td>'
                + '<td><button class="button button-small cmm-resync-single">Re-sync</button></td>'
                + '</tr>'
            );
        });

        var pages = Math.ceil(total / 20);
        var $pag = $('#cmm-pagination').empty();
        for (var p = 1; p <= pages; p++) {
            $pag.append('<button class="button button-small' + (p === currentPage ? ' button-primary' : '') + '" data-page="' + p + '">' + p + '</button> ');
        }
    }

    function formatBytes(b) {
        if (!b) return '0 B';
        var k = 1024, s = ['B','KB','MB','GB'], i = Math.floor(Math.log(b) / Math.log(k));
        return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
    }

    function updateBulkBar() {
        if (selectedIds.size) {
            $('.cmm-bulk-bar').removeClass('cmm-hidden');
            $('#cmm-selected-count').text(selectedIds.size);
        } else {
            $('.cmm-bulk-bar').addClass('cmm-hidden');
        }
    }

    $(document).on('change', '.cmm-file-check', function () {
        var id = +$(this).closest('tr').data('id');
        if ($(this).is(':checked')) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkBar();
    });

    $('#cmm-select-all').on('change', function () {
        var checked = $(this).is(':checked');
        $('.cmm-file-check').prop('checked', checked).each(function () {
            var id = +$(this).closest('tr').data('id');
            checked ? selectedIds.add(id) : selectedIds.delete(id);
        });
        updateBulkBar();
    });

    $(document).on('click', '#cmm-filter-apply', function () { loadFiles(1); });

    $(document).on('click', '#cmm-pagination button', function () { loadFiles(+$(this).data('page')); });

    $(document).on('click', '#cmm-bulk-delete', function () {
        cmm.confirm('Delete ' + selectedIds.size + ' file(s)?', function () {
            cmm.req('cmm_delete_files', { ids: Array.from(selectedIds) }).done(function (r) {
                if (r.success) { cmm.notify('Deleted.', 'success'); selectedIds.clear(); loadFiles(currentPage); }
            });
        });
    });

    $(document).on('click', '#cmm-bulk-resync', function () {
        cmm.req('cmm_resync_files', { ids: Array.from(selectedIds) }).done(function (r) {
            if (r.success) { cmm.notify('Queued ' + r.data.queued + ' jobs.', 'success'); }
        });
    });

    $(document).on('click', '.cmm-resync-single', function () {
        var id = [+$(this).closest('tr').data('id')];
        cmm.req('cmm_resync_files', { ids: id }).done(function () { cmm.notify('Queued.', 'success'); });
    });

    $(document).ready(function () { loadFiles(); });
}(jQuery));
