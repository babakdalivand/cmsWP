# CMS MiniApp — WordPress + Telegram Mini App

مدیریت محتوای وردپرس از طریق Telegram Mini App با پشتیبانی هوش مصنوعی

## تکنولوژی‌ها

| بخش | ابزار |
|---|---|
| Backend | Node.js 18+ · TypeScript · Express |
| Database | **MySQL 8.0** (Hostinger compatible) |
| Frontend | React 18 · Vite · TailwindCSS |
| Auth | WordPress REST API · JWT (15m) · Refresh Token (30d) |
| AI | Gemini · OpenAI · Claude · DeepSeek · Grok · Mistral |
| Queue | In-memory job queue + MySQL persistence (بدون Redis) |
| Data | TanStack Query v5 · Zustand |

---

## نصب روی Hostinger (قدم به قدم)

### ۱. دیتابیس MySQL بساز

در **hPanel → Databases → MySQL Databases**:
- دیتابیس جدید بساز (مثلاً `u123456_cms`)
- یوزر بساز و دسترسی کامل بده
- نام DB، یوزر و پسورد رو یادداشت کن

---

### ۲. Node.js رو فعال کن

در **hPanel → Node.js → Create Application**:
- Node version: **18.x** یا **20.x**
- Application root: یه پوشه (مثلاً `cms_server`)
- Entry point: `dist/app.js`
- پورت رو یادداشت کن (مثلاً `3001`)

---

### ۳. کد سرور رو آپلود و تنظیم کن

از طریق SSH یا Terminal هاستینگر:

```bash
# کلون پروژه از گیت‌هاب
git clone https://github.com/babakdalivand/cmsWP.git
cd cmsWP/server

# نصب پکیج‌ها
npm install --production

# کامپایل TypeScript
npm run build

# ساخت فایل تنظیمات
cp .env.example .env
nano .env
```

مقادیر زیر رو در `.env` پر کن:

```env
NODE_ENV=production
PORT=3001

DB_HOST=localhost
DB_NAME=u123456_cms
DB_USER=u123456_cms
DB_PASSWORD=رمز_دیتابیس

# openssl rand -base64 64
JWT_SECRET=یک_رشته_۶۴_کاراکتری_تصادفی
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_MS=2592000000

# دقیقاً ۳۲ کاراکتر — openssl rand -base64 24
ENCRYPTION_KEY=یک_رشته_۳۲_کاراکتری_تصادفی

WP_URL=https://yoursite.com
WP_API_USER=admin
WP_API_PASSWORD=Application_Password_وردپرس

TELEGRAM_BOT_TOKEN=توکن_ربات_تلگرام
TELEGRAM_ADMIN_CHAT_ID=آیدی_چت_ادمین

CLIENT_URL=https://yoursite.com
```

```bash
# ساخت جداول MySQL
npm run db:migrate:prod
```

---

### ۴. Application Password وردپرس بساز

در وردپرس:
- **Users → Profile → Application Passwords**
- نام: `CMS MiniApp`
- پسورد ساخته‌شده رو در `WP_API_PASSWORD` قرار بده

---

### ۵. کلاینت React رو build کن

**روی کامپیوتر محلی**:

```bash
cd cmsWP/client

# فایل محیطی production بساز
cp .env.production.example .env.production
```

داخل `.env.production` بنویس:
```env
VITE_API_URL=https://yoursite.com/api
```

```bash
npm install
npm run build
```

محتوای پوشه `client/dist/` رو در **File Manager → public_html** آپلود کن.

---

### ۶. Apache Proxy برای `/api` (در public_html)

در **public_html** یه فایل `.htaccess` بساز:

```apache
Options -MultiViews
RewriteEngine On

# Proxy: /api/* → Node.js
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://localhost:3001/api/$1 [P,L]

# React Router SPA fallback
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

---

## ساختار پروژه

```
cmsWP/
├── server/
│   ├── src/
│   │   ├── auth/         # احراز هویت WordPress + JWT + Refresh Token
│   │   ├── ai/           # موتور AI + Job Queue + BYOK + quota
│   │   ├── wp/           # WordPress REST proxy
│   │   ├── content/      # مدیریت محتوا + approval workflow
│   │   ├── scheduler/    # انتشار زمان‌بندی‌شده (node-cron)
│   │   ├── backup/       # بکاپ MySQL → Telegram
│   │   ├── monitoring/   # Winston logger + Correlation IDs
│   │   ├── middleware/   # JWT auth middleware
│   │   ├── routes/       # تمام API endpoints
│   │   ├── db/           # MySQL pool + migration
│   │   └── config/       # تنظیمات محیطی
│   ├── .env.example
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── pages/        # Login, Dashboard, Create, ContentList, Media, Settings, Monitoring
│   │   ├── components/   # BottomNav
│   │   ├── hooks/        # TanStack Query hooks
│   │   ├── store/        # Zustand (auth state)
│   │   └── api/          # Axios client + silent refresh
│   ├── public/
│   │   └── .htaccess     # React Router fallback (کپی می‌شه در dist)
│   ├── .env.production.example
│   └── package.json
│
└── deploy/
    ├── mysql_migration.sql   # اسکریپت ساخت جداول
    └── DEPLOY_GUIDE.md       # راهنمای کامل
```

---

## API Endpoints

| Method | Endpoint | توضیح |
|---|---|---|
| POST | /api/auth/login | ورود با اطلاعات وردپرس |
| POST | /api/auth/refresh | تجدید access token |
| POST | /api/auth/logout | خروج + ابطال refresh token |
| GET | /api/auth/me | اطلاعات کاربر جاری |
| POST | /api/ai/job | ایجاد job هوش مصنوعی (async) |
| GET | /api/ai/job/:id | وضعیت job |
| POST | /api/ai/generate | تولید محتوا (sync) |
| GET | /api/ai/quota | سهمیه روزانه |
| GET | /api/ai/keys | کلیدهای API شخصی |
| POST | /api/ai/keys | ذخیره کلید API (BYOK) |
| DELETE | /api/ai/keys/:provider | حذف کلید |
| GET | /api/content | لیست محتوا |
| POST | /api/content | ایجاد محتوا |
| PUT | /api/content/:id | ویرایش محتوا |
| POST | /api/content/:id/submit | ارسال جهت بررسی |
| POST | /api/content/:id/approve | تأیید (admin) |
| POST | /api/content/:id/reject | رد (admin) |
| GET | /api/wp/categories | دسته‌بندی‌های وردپرس |
| GET | /api/wp/media | کتابخانه مدیا |
| POST | /api/wp/media | آپلود فایل |
| GET | /api/monitoring/logs | لاگ‌های سیستم |
| GET | /api/monitoring/stats | آمار AI |
| GET | /api/users | لیست کاربران (admin) |
| POST | /api/admin/backup | بکاپ دستی |
| GET | /health | وضعیت سرور + دیتابیس |

---

## امکانات

- **AI Job Queue** — پردازش async بدون Redis (in-memory + MySQL)
- **BYOK** — کاربران کلید API شخصی دارند (AES-256 رمزنگاری)
- **Refresh Token Rotation** — چرخش خودکار توکن هر ۱۵ دقیقه
- **بکاپ خودکار** — هر شب ساعت ۰۳:۰۰ به Telegram
- **انتشار زمان‌بندی‌شده** — هر دقیقه چک و publish به وردپرس
- **Correlation IDs** — هر request یه ID یکتا برای trace
- **دوزبانه** — فارسی / انگلیسی / هر دو
