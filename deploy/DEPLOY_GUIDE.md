# راهنمای نصب روی Hostinger (Node.js Hosting)

## پیش‌نیازها
- Node.js >= 18 (فعال از طریق Hostinger hPanel > Node.js)
- MySQL 8.0 (ساخته‌شده در hPanel > Databases)
- WordPress روی همان هاست

---

## ساختار نهایی روی سرور

```
public_html/          ← فایل‌های build شده React (کلاینت)
  index.html
  assets/
  .htaccess           ← React Router fallback (اتوماتیک کپی می‌شه)

nodeapp/              ← کد سرور Node.js
  dist/               ← بعد از npm run build
  node_modules/
  package.json
  .env                ← فایل محیطی (هیچوقت commit نشه)
```

---

## گام ۱ — دیتابیس MySQL

در **hPanel > Databases > MySQL Databases**:
1. دیتابیس جدید بساز (مثلاً `u123456_cms`)
2. یوزر بساز و دسترسی کامل بده

---

## گام ۲ — آپلود و build سرور

```bash
# در سرور (SSH یا Terminal هاستینگر)
cd ~/nodeapp
git clone https://github.com/babakdalivand/cmsWP.git .
# یا فقط پوشه server رو آپلود کن

cd server
npm install --production    # فقط dependencies (نه devDependencies)
npm run build               # کامپایل TypeScript → dist/

# ساخت .env از روی نمونه
cp .env.example .env
nano .env                   # مقادیر واقعی رو وارد کن
```

### مقادیر ضروری .env:
```
NODE_ENV=production
PORT=3001                   # پورتی که هاستینگر داده
DB_HOST=localhost
DB_NAME=u123456_cms
DB_USER=u123456_cms
DB_PASSWORD=your_db_password

JWT_SECRET=<۶۴ کاراکتر تصادفی — openssl rand -base64 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_MS=2592000000

ENCRYPTION_KEY=<دقیقاً ۳۲ کاراکتر — openssl rand -base64 24>

WP_URL=https://yoursite.com
WP_API_USER=admin
WP_API_PASSWORD=<Application Password از WordPress>

TELEGRAM_BOT_TOKEN=123456789:your_bot_token
TELEGRAM_ADMIN_CHAT_ID=your_chat_id

CLIENT_URL=https://yoursite.com
```

### اجرای migration دیتابیس:
```bash
npm run db:migrate:prod     # اجرای فایل SQL روی MySQL
```

---

## گام ۳ — تنظیم Node.js در hPanel

در **hPanel > Node.js**:
- **Node.js version**: 18.x یا 20.x
- **Application root**: `nodeapp/server`
- **Entry point**: `dist/app.js`
- **Environment variables**: PORT رو تنظیم کن

---

## گام ۴ — build کلاینت و آپلود به public_html

**روی کامپیوتر محلی** (قبل از آپلود):
```bash
cd client

# ساخت فایل env برای production
cp .env.production.example .env.production
# ویرایش کن:
# اگه API روی ساب‌دامین api.yoursite.com هست:
# VITE_API_URL=https://api.yoursite.com/api
# اگه همون دامین با Apache proxy:
# VITE_API_URL=   (خالی بذار)

npm install
npm run build
```

محتوای پوشه `client/dist/` رو به `public_html/` آپلود کن.
فایل `.htaccess` اتوماتیک داخل dist هست (React Router fallback).

---

## گام ۵ — WordPress Application Password

1. وارد WordPress > Users > Profile بشو
2. بخش **Application Passwords** رو پیدا کن
3. با نام "CMS MiniApp" یه password جدید بساز
4. این password رو در `WP_API_PASSWORD` قرار بده

---

## گام ۶ — اتصال API به کلاینت (اختیاری: Apache Proxy)

اگه می‌خوای `/api` روی همون دامین کار کنه (بدون ساب‌دامین جداگانه)،
یه فایل `.htaccess` در `public_html/` بساز:

```apache
Options -MultiViews
RewriteEngine On

# Proxy: /api/* → Node.js port 3001
RewriteCond %{REQUEST_URI} ^/api/
RewriteRule ^api/(.*)$ http://localhost:3001/api/$1 [P,L]

# React Router SPA fallback
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

> **توجه**: `mod_proxy` روی Hostinger Business Hosting فعاله. روی Shared ممکنه کار نکنه.
> اگه کار نکرد، از روش ساب‌دامین استفاده کن.

---

## عیب‌یابی

```bash
# تست health سرور
curl https://api.yoursite.com/health

# تست اتصال MySQL
node -e "require('mysql2/promise').createPool({host:'localhost',user:'u123456_cms',password:'pass',database:'u123456_cms'}).getConnection().then(()=>console.log('DB OK'))"

# لاگ‌های سرور (در hPanel > Node.js > Logs)
tail -f ~/nodeapp/server/logs/app.log

# تست WordPress API
curl https://yoursite.com/wp-json/wp/v2/posts
```

---

## امکانات خودکار

| امکان | توضیح |
|---|---|
| بکاپ روزانه | هر شب ۰۳:۰۰ — MySQL dump → gzip → Telegram |
| انتشار زمان‌بندی‌شده | هر دقیقه چک → publish به WordPress |
| Refresh Token | چرخش خودکار هر ۱۵ دقیقه |
| Health Check | `GET /health` — وضعیت DB و سرور |
