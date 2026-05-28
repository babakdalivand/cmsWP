# Security Audit Checklist

## Authentication & Authorization

- [x] All AJAX handlers verify nonce via `check_ajax_referer('cmm_admin', 'nonce', false)`
- [x] All AJAX handlers verify `current_user_can('manage_options')`
- [x] REST API routes protected by JWT middleware (`JwtAuthenticator`) via `rest_authentication_errors` filter
- [x] JWT validates: algorithm (HS256 only), expiry, audience (site_url), HMAC signature
- [x] HMAC comparison uses `hash_equals()` to prevent timing attacks

## Credential Storage

- [x] All provider credentials encrypted with AES-256-GCM before storage
- [x] Encryption key derived from `AUTH_SALT + site_url` — never stored
- [x] Each site in multisite uses its own encryption key
- [x] No credentials stored in `wp_options` in plaintext
- [x] Empty credential fields on update preserve existing encrypted values

## SQL Injection Prevention

- [x] All dynamic queries use `$wpdb->prepare()` with typed placeholders (`%d`, `%s`)
- [x] `LIKE` queries use `$wpdb->esc_like()` before prepare
- [x] `SELECT FOR UPDATE` used inside explicit transactions (no race condition)
- [x] No user-supplied data interpolated directly into SQL strings

## Input Sanitization

- [x] `sanitize_text_field()` on all freeform text inputs
- [x] `sanitize_key()` on type/identifier fields
- [x] `esc_url_raw()` on URL inputs
- [x] `sanitize_textarea_field()` on multi-line inputs (private keys)
- [x] `intval()` / `(int)` cast on all numeric inputs
- [x] Provider type validated against allowlist: `['r2','s3','b2','gdrive','local']`
- [x] Settings keys validated against allowlist before `update_option()`

## Output Escaping

- [x] Template output uses `esc_attr()`, `esc_url()`, `esc_html()` as appropriate
- [x] AJAX responses use `wp_send_json_success()` / `wp_send_json_error()` (auto-encodes)

## File Operations

- [x] File path operations stay within `wp_upload_dir()['basedir']`
- [x] `file_exists()` checked before `file_get_contents()` / `copy()`
- [x] Mime type passed explicitly — not inferred from file extension by cloud adapters

## JWT Security

- [x] 5-minute TTL limits exposure window
- [x] `aud` claim validated against `get_site_url()` — prevents cross-site token reuse
- [x] `iss` claim distinguishes token direction (plugin→cmsWP vs cmsWP→plugin)
- [x] Site key stored in `wp_options` (not hardcoded); configurable per-site

## Multisite

- [x] `switch_to_blog` / `restore_current_blog` wrapped in try/finally
- [x] Each site re-encrypts credentials independently
- [x] Network admin actions require `manage_network` capability

## Known Limitations

- Google Drive `private_key` is decrypted in-memory before use — avoid logging it
- WP-Cron is not a real cron; high-traffic sites should use `wp-cron.php` via system cron
- Bulk migration (REST `/sync`) is capped at 200 attachments per call — use WP-CLI for large migrations
