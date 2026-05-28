<?php defined('ABSPATH') || exit; ?>
<div class="cmm-modal">
    <div class="cmm-modal-header">
        <h3 id="cmm-form-title">Add Provider</h3>
        <button class="cmm-modal-close">✕</button>
    </div>
    <form id="cmm-provider-form">
        <input type="hidden" id="cmm-provider-id" name="id" value="">
        <div class="cmm-field">
            <label>Name</label>
            <input type="text" name="name" id="cmm-provider-name" required>
        </div>
        <div class="cmm-field">
            <label>Type</label>
            <select name="type" id="cmm-provider-type">
                <option value="r2">Cloudflare R2</option>
                <option value="s3">Amazon S3</option>
                <option value="b2">Backblaze B2</option>
                <option value="gdrive">Google Drive</option>
                <option value="local">Local</option>
            </select>
        </div>

        <!-- R2 -->
        <div id="cmm-creds-r2" class="cmm-creds-section">
            <div class="cmm-field"><label>Account ID</label><input type="text" data-cred="account_id" name="credentials[account_id]"></div>
            <div class="cmm-field"><label>Bucket</label><input type="text" data-cred="bucket" name="credentials[bucket]"></div>
            <div class="cmm-field"><label>Access Key ID</label><input type="text" data-cred="access_key_id" name="credentials[access_key_id]"></div>
            <div class="cmm-field"><label>Secret Access Key</label><input type="password" data-cred="secret_access_key" name="credentials[secret_access_key]" placeholder="Leave blank to keep existing"></div>
            <div class="cmm-field"><label>Public Domain (CDN)</label><input type="url" data-cred="public_domain" name="credentials[public_domain]"></div>
        </div>

        <!-- S3 -->
        <div id="cmm-creds-s3" class="cmm-creds-section cmm-hidden">
            <div class="cmm-field"><label>Bucket</label><input type="text" data-cred="bucket" name="credentials[bucket]"></div>
            <div class="cmm-field"><label>Region</label><input type="text" data-cred="region" name="credentials[region]" placeholder="us-east-1"></div>
            <div class="cmm-field"><label>Access Key ID</label><input type="text" data-cred="access_key_id" name="credentials[access_key_id]"></div>
            <div class="cmm-field"><label>Secret Access Key</label><input type="password" data-cred="secret_access_key" name="credentials[secret_access_key]" placeholder="Leave blank to keep existing"></div>
            <div class="cmm-field"><label>CDN Domain</label><input type="url" data-cred="cdn_domain" name="credentials[cdn_domain]"></div>
        </div>

        <!-- B2 -->
        <div id="cmm-creds-b2" class="cmm-creds-section cmm-hidden">
            <div class="cmm-field"><label>Key ID</label><input type="text" data-cred="key_id" name="credentials[key_id]"></div>
            <div class="cmm-field"><label>Application Key</label><input type="password" data-cred="application_key" name="credentials[application_key]" placeholder="Leave blank to keep existing"></div>
            <div class="cmm-field"><label>Bucket</label><input type="text" data-cred="bucket" name="credentials[bucket]"></div>
            <div class="cmm-field"><label>Endpoint</label><input type="text" data-cred="endpoint" name="credentials[endpoint]" placeholder="s3.us-west-002.backblazeb2.com"></div>
            <div class="cmm-field"><label>CDN Domain</label><input type="url" data-cred="cdn_domain" name="credentials[cdn_domain]"></div>
        </div>

        <!-- Google Drive -->
        <div id="cmm-creds-gdrive" class="cmm-creds-section cmm-hidden">
            <div class="cmm-field"><label>Service Account Email</label><input type="email" data-cred="client_email" name="credentials[client_email]"></div>
            <div class="cmm-field"><label>Folder ID</label><input type="text" data-cred="folder_id" name="credentials[folder_id]"></div>
            <div class="cmm-field"><label>Private Key (PEM)</label><textarea data-cred="private_key" name="credentials[private_key]" rows="6" placeholder="Leave blank to keep existing"></textarea></div>
            <div class="cmm-field"><label><input type="checkbox" data-cred="make_public" name="credentials[make_public]" value="1"> Make files public</label></div>
        </div>

        <!-- Local -->
        <div id="cmm-creds-local" class="cmm-creds-section cmm-hidden">
            <div class="cmm-field"><label>Base Path</label><input type="text" data-cred="base_path" name="credentials[base_path]"></div>
            <div class="cmm-field"><label>Base URL</label><input type="url" data-cred="base_url" name="credentials[base_url]"></div>
        </div>

        <div class="cmm-form-actions">
            <button type="submit" class="button button-primary">Save Provider</button>
            <button type="button" class="button cmm-btn-test">Test Connection</button>
            <span class="cmm-modal-close button">Cancel</span>
        </div>
    </form>
</div>
