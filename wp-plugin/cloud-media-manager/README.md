# Cloud Media Manager

Multi-cloud media storage plugin for WordPress. Offloads media uploads to Cloudflare R2, Amazon S3, Backblaze B2, or Google Drive with a background queue, JWT-based cmsWP sync, and full multisite support.

## Requirements

- PHP 8.1+
- WordPress 6.0+
- `openssl` extension (for AES-256-GCM encryption and Google Drive auth)
- MySQL 5.7+ or MariaDB 10.3+ (for `SELECT FOR UPDATE` transactions)

## Installation

### Option 1 — Upload

1. Download the plugin zip (exclude `.distignore` paths).
2. Upload to `wp-content/plugins/cloud-media-manager/`.
3. Activate in **Plugins** admin screen.

### Option 2 — Deploy Script

```bash
pip install paramiko
python deploy/deploy_plugin.py
```

The script uploads all plugin files via SFTP to the configured server.

## Configuration

### 1. Add a Storage Provider

Go to **Cloud Media → Providers** → click **+ Add Provider**.

| Provider | Required Credentials |
|---|---|
| Cloudflare R2 | Account ID, Bucket, Access Key ID, Secret Access Key |
| Amazon S3 | Bucket, Region, Access Key ID, Secret Access Key |
| Backblaze B2 | Key ID, Application Key, Bucket, Endpoint |
| Google Drive | Service Account Email, Folder ID, Private Key (PEM) |
| Local | Base Path, Base URL |

After saving, click **Test Connection** to verify.

### 2. Configure Settings

**Cloud Media → Settings**:
- **Auto Upload**: Upload new media automatically on `wp_handle_upload`
- **Delete Local**: Remove local file after successful cloud upload
- **cmsWP URL**: URL of your cmsWP server instance
- **Site Key**: Shared JWT secret with cmsWP (generate a strong random string)

### 3. Migrate Existing Media

**Via WP-CLI (recommended for large sites):**

```bash
# Preview without uploading
wp cmm migrate run --dry-run

# Queue all uploads asynchronously
wp cmm migrate run --async --skip-existing

# Upload synchronously (small sites)
wp cmm migrate run --provider=1
```

**Via REST API (triggers up to 200 attachments):**

```http
POST /wp-json/cmm/v1/sync
Authorization: Bearer <jwt>
Content-Type: application/json

{"action": "migrate_local"}
```

## WP-CLI Commands

```bash
# Queue management
wp cmm queue status [--watch]
wp cmm queue run [--limit=15] [--watch] [--verbose]
wp cmm queue prune [--days=7]

# Logs
wp cmm logs [--level=error] [--limit=50] [--follow]

# Multisite
wp cmm network status
wp cmm network migrate
wp cmm network broadcast '{"auto_upload":"1"}'
wp cmm network run_queue [--limit=15]
```

## Architecture

```
cloud-media-manager/
├── cloud-media-manager.php  Main plugin file
├── database/Schema.php      DB table creation (dbDelta)
├── src/
│   ├── Container.php        Minimal DI container
│   ├── Plugin.php           Bootstrapper + service bindings
│   ├── Security/            JwtAuthenticator, CredentialEncryptor (AES-256-GCM)
│   ├── Http/                AwsSignatureV4 (no SDK, pure wp_remote_*)
│   ├── Adapters/            R2, S3, B2, GoogleDrive, Local
│   ├── Repository/          Provider, File, Log repositories ($wpdb->prepare)
│   ├── Services/            StorageService, CmsWPClientService
│   ├── Api/                 REST namespace cmm/v1
│   ├── Admin/               Admin menu, AJAX handlers (nonce + capability)
│   ├── Queue/               Queue, Worker, UploadJob, RetryableException
│   ├── Cron/                CronRegistrar, CronRunner (transient lock)
│   ├── Cli/                 WP-CLI commands
│   └── Multisite/           SiteSwitcher, NetworkBroadcast, NetworkAdmin
├── templates/admin/         PHP templates for admin pages
├── assets/                  CSS + JS
└── tests/                   PHPUnit unit + integration tests
```

## Running Tests

```bash
composer install
vendor/bin/phpunit --testsuite Unit
```

For integration tests, configure a WordPress test environment first:
```bash
WP_TESTS_DIR=/path/to/wp-tests vendor/bin/phpunit --testsuite Integration
```

## Security

All credential fields are encrypted with AES-256-GCM. The encryption key is derived from `AUTH_SALT + site_url` and is never stored. See [SECURITY.md](SECURITY.md) for the full audit checklist.

## License

GPL-2.0-or-later
