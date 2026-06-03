# Session Starter — cmsWP Mini-App + Cloud Media Manager Plugin

> Last updated: 2026-06-04
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
- **Latest commit:** `28c99340` — fix(youtube): show real error + Claude fallback for AI summary

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
| AI | Claude, Gemini, OpenAI, DeepSeek, Grok, Mistral |
| Deploy | GitHub Actions CI/CD (auto on push to main) |
| WP Plugin | PHP 8.3, WordPress hooks, REST API, WP-Cron, WP-CLI |
| Cloud Storage | Cloudflare R2, Amazon S3, Backblaze B2, Google Drive, Local |

---

## Project Structure

```
cmsWP/
├── client/src/
│   ├── App.tsx
│   ├── pages/ (16 pages)
│   └── components/layout/BottomNav.tsx
├── server/src/
│   ├── routes/index.ts
│   ├── auth/authController.ts
│   ├── storage/storageController.ts
│   ├── ai/aiRouter.ts
│   ├── bot/telegramBot.ts
│   ├── books/booksController.ts
│   └── backup/backup.ts
├── wp-plugin/cloud-media-manager/
├── wp-plugin/pa-youtube-sync/
└── .github/workflows/deploy.yml  ← CI/CD auto-deploy
```

---

## Critical Architecture Notes

### JWT Authentication (Plugin ↔ Mini-app)
Two conflicting JWT plugins on WordPress intercept `Authorization: Bearer`.
Our plugin uses **`X-CMM-Token`** custom header instead.
- **Site Key:** `8b6c0669aea72fd807a2c7adc14a5f8de06137f699d09784`
- **WP option name:** `cmm_site_key`

### CI/CD
Push to `main` → GitHub Actions auto-deploys everything.
Secret `SSH_PASSWORD` already set in repo.

### Manual Deploy (fallback)
```bash
cd "E:\MiniApp Projects\cmsWP"
python deploy.py server|client|all|restart
```

---

## Current Status (2026-06-04) — PROJECT COMPLETE ✅

All major features built, tested, and deployed.
See `REPORT_2026-06-04.md` for full project report.

---

## Pending / Future Work

- [ ] Add R2/S3 cloud providers (low priority)
- [ ] PHPUnit tests for cloud-media-manager
- [ ] Dark mode for site visitors

---

## Security Rules (MUST PRESERVE)
- Never store provider credentials unencrypted in wp_options
- JWT TTL: 5 minutes, audience must match site_url exactly
- Site Key must be kept secret
- Subscriber role must never have access to mini-app
- SSH credentials must not be committed to git
