# راهنمای نصب روی Hostinger

## پیش‌نیازها
- Node.js >= 18 (فعال از طریق Hostinger hPanel)
- MySQL 8.0 (ساخته‌شده در hPanel > Databases)
- WordPress روی همان هاست

---

## گام ۱ — دیتابیس MySQL

در **hPanel > Databases > MySQL Databases**:
1. یک دیتابیس جدید بسازید (مثلاً `u123456_cms`)
2. یک user بسازید و به دیتابیس دسترسی کامل بدید

سپس migration رو اجرا کنید:
```bash
mysql -h localhost -u u123456_cms -p u123456_cms < mysql_migration.sql
```

---

## گام ۲ — فایل‌های سرور

1. پوشه `server` رو به root هاست آپلود کنید
2. فایل `.env` بسازید (از `.env.example` کپی کنید)
3. مقادیر را پر کنید:

```bash
cp .env.example .env
nano .env
```

```
NODE_ENV=production
DB_HOST=localhost
DB_NAME=u123456_cms
DB_USER=u123456_cms
DB_PASSWORD=your_password
JWT_SECRET=<64 کاراکتر تصادفی>
ENCRYPTION_KEY=<دقیقاً 32 کاراکتر>
WP_URL=https://yoursite.com
WP_API_USER=admin
WP_API_PASSWORD=<Application Password از WP>
TELEGRAM_BOT_TOKEN=<توکن ربات>
TELEGRAM_ADMIN_CHAT_ID=<آیدی چت شما>
```

4. پکیج‌ها را نصب و build کنید:
```bash
npm install
npm run build
npm run db:migrate   # اگر از ts-node استفاده می‌کنید
```

5. در **hPanel > Node.js** تنظیم کنید:
   - Entry point: `dist/app.js`
   - Node version: 18.x یا 20.x

---

## گام ۳ — فایل‌های کلاینت

1. فایل `.env.production` در پوشه `client` بسازید:
```
VITE_API_URL=https://yourserver.com/api
```

2. Build کنید:
```bash
cd client
npm install
npm run build
```

3. محتوای پوشه `dist` را در public_html آپلود کنید

---

## گام ۴ — WordPress Application Password

1. در WordPress > Users > Profile
2. بخش **Application Passwords** را پیدا کنید
3. یک password جدید با نام "CMS MiniApp" بسازید
4. این password را در `WP_API_PASSWORD` قرار دهید

---

## بکاپ خودکار

سرور هر شب ساعت ۰۳:۰۰ به‌صورت خودکار:
1. از MySQL dump می‌گیرد
2. فایل را gzip می‌کند
3. به Telegram admin ارسال می‌کند

برای بکاپ دستی:
```
POST /api/admin/backup
Authorization: Bearer <admin_token>
```

---

## زمان‌بندی انتشار

محتواهایی که `scheduled_at` دارند، هر دقیقه یک‌بار توسط cron چک می‌شوند و در زمان مقرر به WordPress منتشر می‌شوند.

---

## عیب‌یابی

```bash
# مشاهده لاگ‌ها
tail -f /home/u123456/logs/app.log

# تست اتصال MySQL
node -e "require('mysql2/promise').createPool({host:'localhost',user:'u123456_cms',password:'pass',database:'u123456_cms'}).getConnection().then(()=>console.log('OK'))"

# تست WordPress API
curl https://yoursite.com/wp-json/wp/v2/posts
```
