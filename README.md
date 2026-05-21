# CMS MiniApp WordPress

## راه‌اندازی

### پیش‌نیازها
- Node.js >= 18
- PostgreSQL >= 14
- WordPress با REST API فعال

### نصب Server

```bash
cd server
npm install
cp .env.example .env
# ویرایش .env با اطلاعات واقعی
npm run db:migrate
npm run dev
```

### نصب Client

```bash
cd client
npm install
npm run dev
```

### Build برای Production

```bash
# Server
cd server && npm run build

# Client
cd client && npm run build
```

## ساختار پروژه

```
project/
├── server/              # Node.js + TypeScript + Express
│   └── src/
│       ├── auth/        # احراز هویت WordPress
│       ├── ai/          # موتور AI + BYOK + quota
│       ├── wp/          # WordPress REST proxy
│       ├── content/     # مدیریت محتوا + approval workflow
│       ├── monitoring/  # لاگ + آمار
│       ├── routes/      # تمام API endpoints
│       └── db/          # PostgreSQL + migration
└── client/              # React + Vite + Tailwind
    └── src/
        ├── pages/       # Login, Dashboard, Create, Media, Settings, Monitoring
        ├── components/  # BottomNav + UI
        ├── store/       # Zustand (auth)
        └── api/         # Axios client
```

## API Endpoints

| Method | Endpoint | توضیح |
|--------|----------|-------|
| POST | /api/auth/login | ورود با اطلاعات وردپرس |
| GET  | /api/auth/me | اطلاعات کاربر |
| POST | /api/ai/generate | تولید محتوا با AI |
| GET  | /api/ai/quota | وضعیت سهمیه |
| POST | /api/ai/keys | ذخیره کلید شخصی (BYOK) |
| GET  | /api/content | لیست محتوا |
| POST | /api/content | ایجاد محتوا |
| POST | /api/content/:id/submit | ارسال جهت بررسی |
| POST | /api/content/:id/approve | تأیید (admin) |
| GET  | /api/wp/media | کتابخانه مدیا |
| POST | /api/wp/media | آپلود فایل |
| GET  | /api/monitoring/logs | لاگ‌های سیستم |
