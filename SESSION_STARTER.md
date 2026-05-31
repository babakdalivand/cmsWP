# Session Starter — cmsWP Mini-App + Cloud Media Manager Plugin

> Last updated: 2026-05-29
> Use this prompt to resume development in a new Claude Code session.

---

## Project Description

**cmsWP** is a Telegram Mini-App and web management panel for the Persian Atheists WordPress website (persianatheists.com). It consists of:

1. **React client** — mobile-first management UI (Vite + TailwindCSS)
2. **Node.js/Express server** — TypeScript API server with JWT auth, WordPress proxy, AI, YouTube sync
3. **WordPress plugin** — `cloud-media-manager` — multi-cloud media storage with REST API + queue system
4. **WordPress plugin** — `pa-youtube-sync` — YouTube sync, AI content generation, membership system

The mini-app authenticates using WordPress credentials (phpass). Only users with roles admin/editor/author/contributor can log in. Subscribers are blocked with 403.

---

## Server & Infrastructure

| Item | Value |
|------|-------|
| SSH Host | 82.198.229.155 |
| SSH Port | 65002 |
| SSH User | u775839017 |
| SSH Password | 68120378994Sara@ |
| WordPress URL | https://persianatheists.com |
| Mini-app URL | https://app.persianatheists.com |
| Node.js path | `/home/u775839017/domains/app.persianatheists.com/nodejs` |
| Server .env path | `/home/u775839017/domains/app.persianatheists.com/public_html/.builds/config/.env` |
| WP path | `/home/u775839017/domains/persianatheists.com/public_html` |
| Plugin path | `/home/u775839017/domains/persianatheists.com/public_html/wp-content/plugins/cloud-media-manager` |
| DB Host | srv2147.hstgr.io |
| DB Name | u775839017_de3SN |
| DB User | u775839017_2n8MB |

---

## GitHub

- **Repo:** https://github.com/babakdalivand/cmsWP
- **Branch:** main
- **Latest commit:** `b717a46` — block subscriber role from mini-app login

---

## Local File Paths

- **Project root:** `E:\MiniApp Projects\cmsWP\`
- **React client:** `E:\MiniApp Projects\cmsWP\client\`
- **Node server:** `E:\MiniApp Projects\cmsWP\server\`
- **WP Plugin (Cloud Media):** `E:\MiniApp Projects\cmsWP\wp-plugin\cloud-media-manager\`
- **WP Plugin (YouTube Sync):** `E:\MiniApp Projects\cmsWP\wp-plugin\pa-youtube-sync\`
- **Deploy script:** `E:\MiniApp Projects\cmsWP\deploy.py`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, TailwindCSS, Lucide, Zustand, React Query |
| Backend | Node.js, Express, TypeScript |
| Auth | JWT HS256, WordPress phpass |
| Database | MySQL (Hostinger shared hosting) |
| AI | Claude API (Anthropic) |
| Deploy | Python paramiko SFTP |
| WP Plugin | PHP 8.3, WordPress hooks, REST API, WP-Cron, WP-CLI |
| Cloud Storage | Cloudflare R2, Amazon S3, Backblaze B2, Google Drive, Local |

---

## Project Structure

```
cmsWP/
├── client/src/
│   ├── App.tsx                    ← Router (all routes)
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── CloudStorage.tsx       ← Cloud storage management (3 tabs)
│   │   ├── YouTubeManager.tsx
│   │   ├── Membership.tsx
│   │   └── ... (14 pages total)
│   └── components/layout/BottomNav.tsx  ← 5 tabs incl. فضا (cloud)
├── server/src/
│   ├── routes/index.ts            ← All routes incl. /storage/*
│   ├── auth/authController.ts     ← Login (blocks subscriber role)
│   ├── storage/storageController.ts  ← Proxy to WP plugin via JWT
│   ├── ai/aiController.ts
│   └── youtube/ytController.ts
├── wp-plugin/cloud-media-manager/
│   ├── cloud-media-manager.php    ← Main plugin file
│   ├── database/Schema.php        ← 4 tables: providers, files, logs, jobs
│   └── src/
│       ├── Security/JwtAuthenticator.php  ← X-CMM-Token header, priority 1
│       ├── Adapters/GoogleDriveAdapter.php  ← Subfolder auto-creation
│       ├── Api/RestRegistrar.php   ← cmm/v1 REST endpoints
│       ├── Queue/                  ← Async job queue with retry
│       └── Cron/                   ← WP-Cron schedules
└── deploy.py                      ← SFTP deploy script
```

---

## Critical Architecture Notes

### JWT Authentication (Plugin ↔ Mini-app)
**IMPORTANT:** Two conflicting JWT plugins are active on WordPress:
- `jwt-auth` (3.0.2)
- `jwt-authentication-for-wp-rest-api` (1.5.0)

These intercept `Authorization: Bearer` tokens. Our plugin uses **`X-CMM-Token`** custom header instead.

- **Plugin side** (`JwtAuthenticator.php`): reads `$_SERVER['HTTP_X_CMM_TOKEN']` first, falls back to Bearer
- **Server side** (`storageController.ts`): sends `headers: { 'X-CMM-Token': token }`
- **Site Key:** `8b6c0669aea72fd807a2c7adc14a5f8de06137f699d09784`
- **WP option name:** `cmm_site_key`
- **JWT audience:** must match `get_site_url()` = `https://persianatheists.com`

### Deploy Commands
```bash
# Deploy server (TypeScript compiled):
cd "E:\MiniApp Projects\cmsWP"
python deploy.py server    # upload server JS files + restart

# Deploy React client:
python deploy.py client    # build + upload dist/

# Deploy everything:
python deploy.py all
```

### TypeScript Compile
```bash
cd "E:\MiniApp Projects\cmsWP\server"
npx tsc
```

---

## Cloud Media Manager Plugin — Key Details

### Tables Created on Activation
- `wp_cmm_providers` — provider configs (credentials AES-256-GCM encrypted)
- `wp_cmm_files` — managed files
- `wp_cmm_logs` — operation logs
- `wp_cmm_jobs` — async job queue

### Credential Encryption
- Algorithm: AES-256-GCM
- Key: `substr(hash('sha256', AUTH_SALT . get_site_url(), true), 0, 32)`
- Never store unencrypted in wp_options

### REST Endpoints (all require X-CMM-Token)
- `GET /wp-json/cmm/v1/status`
- `GET /wp-json/cmm/v1/providers`
- `POST /wp-json/cmm/v1/providers`
- `DELETE /wp-json/cmm/v1/providers/{id}`
- `POST /wp-json/cmm/v1/providers/{id}/default`
- `GET /wp-json/cmm/v1/config`
- `POST /wp-json/cmm/v1/config`
- `POST /wp-json/cmm/v1/sync`
- `GET /wp-json/cmm/v1/logs`

### Google Drive Provider (Active)
- Folder ID: `1YvVgSIglSORMZi3KbjMvI2YWAj6ZWmwx`
- Subfolder auto-creation: `podcasts/ep01.mp3` → creates `podcasts/` in Drive root folder
- Connection tested ✓

---

## Current Status (2026-05-29)

✅ Plugin active and working on persianatheists.com
✅ JWT connection confirmed (200 OK on all endpoints)
✅ Google Drive provider connected
✅ Subscriber role blocked from mini-app
✅ React CloudStorage page with bottom nav fix
✅ All changes committed and pushed to GitHub

---

## Pending Tasks

### High Priority
- [ ] Test full file upload flow through mini-app → plugin → Google Drive
- [ ] CI/CD: add GitHub Actions secrets for auto-deploy

### Medium Priority
- [ ] Add more cloud providers (R2, S3) if needed
- [ ] Run `composer install` on server for PHPUnit tests

### Low Priority
- [ ] Dark mode toggle for site visitors
- [ ] Clean up `server-patch/` directory (old files)
- [ ] Investigate `frontend/` (Next.js) deploy status

---

## Security Rules (MUST PRESERVE)
- Never store provider credentials unencrypted in wp_options
- JWT TTL: 5 minutes, audience must match site_url exactly
- Site Key must be kept secret — it's the shared HMAC secret
- Subscriber role must never have access to mini-app
- SSH credentials must not be committed to git
