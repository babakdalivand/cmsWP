# گزارش کامل پروژه cmsWP — مینی‌اپ مدیریت Persian Atheists

> **آخرین به‌روزرسانی:** 2026-05-28  
> **GitHub:** https://github.com/babakdalivand/cmsWP  
> **محیط اجرا:** Node.js (app.persianatheists.com) + React (client)  
> **سرور:** Hostinger — IP: 82.198.229.155، Port SSH: 65002  
> **مسیر روی سرور:** `/home/u775839017/domains/app.persianatheists.com/nodejs`

---

## ۱. خلاصه پروژه

cmsWP یک مینی‌اپ مدیریتی است که به عنوان پنل کنترل اختصاصی برای سایت **persianatheists.com** طراحی شده.  
از یک سمت به WordPress (از طریق REST API و wp-proxy) متصل است و از سمت دیگر یک رابط کاربری موبایل-فرست React دارد.  
احراز هویت از طریق رمزهای WordPress انجام می‌شود (phpass).

---

## ۲. معماری کلی

```
┌─────────────────────────────────────────────┐
│             React Client (Vite)              │
│  client/src/pages/ + components/             │
│  آدرس: https://app.persianatheists.com       │
└─────────────────┬───────────────────────────┘
                  │ HTTP/REST
┌─────────────────▼───────────────────────────┐
│          Node.js / Express Server            │
│  server/src/ — TypeScript                    │
│  پورت: 3000 (پشت nginx/passenger)           │
└──┬──────────────┬──────────────┬────────────┘
   │              │              │
   ▼              ▼              ▼
WordPress     MySQL DB      Telegram Bot
REST API      (مستقیم)      (اعلان‌ها)
persianatheists.com
```

---

## ۳. ساختار فایل‌ها

```
cmsWP/
├── client/                   ← React + Vite + TailwindCSS
│   ├── src/
│   │   ├── App.tsx           ← Router اصلی (تمام مسیرها)
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ContentList.tsx
│   │   │   ├── CreateContent.tsx
│   │   │   ├── WPPosts.tsx
│   │   │   ├── WPEditPost.tsx
│   │   │   ├── Categories.tsx
│   │   │   ├── Comments.tsx
│   │   │   ├── MediaLibrary.tsx
│   │   │   ├── YouTubeManager.tsx
│   │   │   ├── Membership.tsx
│   │   │   ├── ApiSettings.tsx
│   │   │   ├── Monitoring.tsx
│   │   │   ├── Profile.tsx
│   │   │   └── CloudStorage.tsx  ← جدید: مدیریت فضای ابری
│   │   ├── components/
│   │   │   ├── layout/BottomNav.tsx   ← نوار پایین (5 تب)
│   │   │   └── ui/  (EditorToolbar, RichTextEditor, SoftCard, ThemeToggle)
│   │   ├── api/client.ts     ← Axios instance با interceptor
│   │   ├── store/authStore.ts ← Zustand auth state
│   │   ├── contexts/ThemeContext.tsx
│   │   └── hooks/  (useQueries, useRealtime)
│   └── package.json (React 18, Vite, TailwindCSS, Lucide)
│
├── server/src/               ← Express + TypeScript
│   ├── app.ts                ← Express setup + middleware
│   ├── routes/index.ts       ← تمام مسیرها یکجا
│   ├── middleware/auth.ts    ← JWT middleware
│   ├── auth/
│   │   ├── authController.ts ← login/logout/me
│   │   └── phpass.ts         ← تطابق رمز WordPress
│   ├── ai/
│   │   ├── aiController.ts   ← هوش مصنوعی (Claude API)
│   │   ├── aiRouter.ts
│   │   ├── encryption.ts     ← رمزنگاری API key
│   │   └── jobQueue.ts       ← صف کارهای AI
│   ├── storage/
│   │   └── storageController.ts ← جدید: پراکسی به پلاگین Cloud Media Manager
│   ├── content/contentController.ts
│   ├── youtube/ytController.ts
│   ├── membership/membershipController.ts
│   ├── wp/wpProxy.ts         ← پراکسی به WordPress REST API
│   ├── bot/telegramBot.ts    ← اعلان تلگرام
│   ├── db/pool.ts            ← MySQL connection pool
│   ├── backup/backup.ts
│   ├── scheduler/scheduler.ts
│   └── monitoring/logger.ts
│
├── wp-plugin/
│   ├── cloud-media-manager/  ← پلاگین WordPress (جدید، کامل)
│   │   ├── cloud-media-manager.php  ← فایل اصلی
│   │   ├── database/Schema.php      ← 4 جدول DB
│   │   ├── src/
│   │   │   ├── Adapters/     ← R2, S3, B2, GoogleDrive, Local
│   │   │   ├── Admin/        ← صفحات ادمین + AJAX
│   │   │   ├── Api/          ← REST API (cmm/v1)
│   │   │   ├── Cli/          ← WP-CLI commands
│   │   │   ├── Cron/         ← WP-Cron schedules
│   │   │   ├── Http/         ← AWS Signature V4
│   │   │   ├── Multisite/    ← پشتیبانی Multisite
│   │   │   ├── Queue/        ← صف کار + retry
│   │   │   ├── Repository/   ← دسترسی به DB
│   │   │   ├── Security/     ← JWT + AES-256-GCM
│   │   │   ├── Services/     ← StorageService + CmsWPClient
│   │   │   ├── Container.php ← DI Container
│   │   │   └── Plugin.php    ← bootstrap
│   │   ├── templates/admin/  ← 7 قالب PHP
│   │   ├── assets/           ← CSS + JS ادمین
│   │   ├── tests/            ← Unit + Integration
│   │   └── deploy/deploy_plugin.py ← SFTP deploy پلاگین
│   └── pa-youtube-sync/      ← پلاگین یوتیوب (قدیمی‌تر، مستقل)
│       └── inc/  (30+ فایل PHP)
│
├── frontend/                 ← Next.js (فرانت‌اند عمومی سایت — جداگانه)
├── deploy.py                 ← اسکریپت SFTP deploy مینی‌اپ
└── deploy/
    ├── DEPLOY_GUIDE.md
    └── mysql_migration.sql
```

---

## ۴. صفحات مینی‌اپ و وضعیت

| صفحه | مسیر | وضعیت |
|------|-------|--------|
| ورود | `/login` | ✅ کامل |
| داشبورد | `/` | ✅ کامل |
| مدیریت محتوا | `/content` | ✅ کامل |
| ساخت محتوا | `/create` | ✅ کامل |
| پست‌های WP | `/wp-posts` | ✅ کامل |
| ویرایش پست WP | `/wp-edit/:id` | ✅ کامل |
| دسته‌بندی‌ها | `/categories` | ✅ کامل |
| نظرات | `/comments` | ✅ کامل |
| مدیاهای سایت | `/media` | ✅ کامل |
| مدیریت یوتیوب | `/youtube` | ✅ کامل |
| عضویت | `/membership` | ✅ کامل |
| تنظیمات API | `/api-settings` | ✅ کامل |
| مانیتورینگ | `/monitoring` | ✅ کامل |
| پروفایل | `/profile` | ✅ کامل |
| **فضای ابری** | `/cloud-storage` | ✅ کامل (جدید) |

---

## ۵. سیستم هوش مصنوعی

- **موتور:** Claude API (Anthropic)  
- **مسیر:** `/ai/*`  
- **قابلیت‌ها:** تولید محتوا، بهینه‌سازی سئو، تولید تیتر، خلاصه‌سازی  
- **مدیریت API Key:** رمزنگاری AES-256-GCM در DB — ادمین می‌تواند یک کلید global تعریف کند  
- **صف کار:** jobQueue.ts — کارهای سنگین async پردازش می‌شوند  
- **وضعیت:** ✅ فعال روی سرور

---

## ۶. پلاگین Cloud Media Manager

### هدف
اتصال WordPress به سرویس‌های ذخیره‌سازی ابری برای آپلود/مدیریت فایل‌های رسانه‌ای.

### آداپتورهای پشتیبانی‌شده
| آداپتور | وضعیت |
|---------|--------|
| Cloudflare R2 | ✅ کامل |
| Amazon S3 | ✅ کامل |
| Backblaze B2 | ✅ کامل |
| Google Drive | ✅ کامل |
| Local (سرور محلی) | ✅ کامل |

### جداول پایگاه داده
```sql
wp_cmm_providers   — تنظیمات provider (رمزنگاری‌شده)
wp_cmm_files       — فایل‌های مدیریت‌شده
wp_cmm_logs        — لاگ عملیات
wp_cmm_jobs        — صف کار async
```

### امنیت
- اطلاعات محرمانه provider: **AES-256-GCM** — کلید از `AUTH_SALT + site_url`
- ارتباط مینی‌اپ ↔ پلاگین: **JWT HS256** — TTL 5 دقیقه، `site_key` اختصاصی

### وضعیت نصب
- ✅ آپلود شده روی: `/home/u775839017/domains/persianatheists.com/public_html/wp-content/plugins/cloud-media-manager`
- ✅ فعال‌سازی انجام شده (جداول ساخته شده)
- ⏳ **نیاز به پیکربندی:** Site Key باید هم در پلاگین (Cloud Media → Settings) و هم در مینی‌اپ (تب فضا) تنظیم شود

---

## ۷. Deploy

### مینی‌اپ (Node.js + React)
```bash
python deploy.py all       # build React + upload همه فایل‌ها + restart
python deploy.py server    # فقط فایل‌های سرور
python deploy.py client    # فقط React build
python deploy.py restart   # فقط restart سرور
```

### پلاگین WordPress
```bash
cd wp-plugin/cloud-media-manager
python deploy/deploy_plugin.py
```

### CI/CD
- فایل `.github/workflows/deploy.yml` وجود دارد (بررسی شود آیا فعال است)

---

## ۸. محیط و متغیرهای محیطی

### سرور (server/.env.example)
```
PORT=3000
DB_HOST=srv2147.hstgr.io
DB_PORT=3306
DB_NAME=u775839017_de3SN
DB_USER=u775839017_2n8MB
WP_URL=https://persianatheists.com
WP_USERNAME=...
WP_APP_PASSWORD=...
JWT_SECRET=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### کلاینت (client/.env.production.example)
```
VITE_API_URL=https://app.persianatheists.com/api
```

---

## ۹. کارهای انجام‌شده (تاریخچه)

| تاریخ | کار |
|-------|-----|
| قبل از 2026-05 | ساخت مینی‌اپ اولیه: auth، dashboard، محتوا، WP proxy |
| 2026-05 | اضافه کردن هوش مصنوعی Claude، رمزنگاری API key |
| 2026-05 | مدیریت یوتیوب (sync، تولید خودکار محتوا) |
| 2026-05 | سیستم عضویت |
| 2026-05-28 | **پلاگین Cloud Media Manager** (9 فاز، 67 فایل، کامل) |
| 2026-05-28 | **صفحه CloudStorage.tsx** در مینی‌اپ |
| 2026-05-28 | **storageController.ts** روی سرور Node.js |
| 2026-05-28 | deploy و فعال‌سازی پلاگین روی سرور |

---

## ۱۰. کارهای باقی‌مانده / TODO

### اولویت بالا
- [ ] **تنظیم Site Key** بین پلاگین WordPress و مینی‌اپ (اتصال JWT)
- [ ] **تست end-to-end** اتصال مینی‌اپ ↔ پلاگین
- [ ] **اضافه کردن حداقل یک provider** (R2 یا S3) در تنظیمات پلاگین

### اولویت متوسط
- [ ] اجرای `composer install` روی سرور برای تست‌های PHPUnit
- [ ] بررسی و فعال‌سازی CI/CD در GitHub Actions
- [ ] صفحه `ApiEndpoints.php` در REST API پلاگین (برخی endpointها stub هستند)

### اولویت پایین
- [ ] فرانت‌اند Next.js (`frontend/`) — ظاهراً مستقل است و وضعیت deploy آن مشخص نیست
- [ ] بررسی `server-patch/` — فایل‌های قدیمی که ممکن است دیگر لازم نباشند
- [ ] حذف یا ادغام `raha-multilingual.php` در `wp-plugin/`

---

## ۱۱. نکات مهم برای ادامه کار

1. **MySQL max_connections_per_hour:** هاستینگر محدودیت 500 اتصال در ساعت دارد. اگر سایت down شد، یک ساعت صبر کن.

2. **SSH:** `ssh -p 65002 u775839017@82.198.229.155` — برای دیباگ مستقیم سرور.

3. **Restart Node.js:** با `touch /home/u775839017/domains/app.persianatheists.com/nodejs/tmp/restart.txt`

4. **JWT بین مینی‌اپ و پلاگین:** الگوریتم HS256، مخاطب `cmm-plugin`، TTL 5 دقیقه. `site_key` را در هر دو طرف یکسان تنظیم کن.

5. **رمزنگاری credentials پلاگین:** کلید رمزنگاری از `AUTH_SALT` و `site_url` ساخته می‌شود — اگر سایت migrate شود credentials باید دوباره تنظیم شوند.
