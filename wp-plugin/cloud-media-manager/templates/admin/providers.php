<?php defined('ABSPATH') || exit; ?>
<div class="wrap cmm-wrap">
    <h1>Storage Providers <button class="button button-primary cmm-btn-add-provider">+ Add Provider</button></h1>
    <div id="cmm-providers-list"></div>
    <div id="cmm-provider-form-modal" class="cmm-modal-overlay cmm-hidden">
        <?php include __DIR__ . '/provider-form.php'; ?>
    </div>
</div>
