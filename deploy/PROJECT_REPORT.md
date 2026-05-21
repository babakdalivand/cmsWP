# گزارش جامع پروژه: CMS MiniApp Wp
## تاریخ تهیه: ۱۴۰۴/۰۳/۳۱

---

# ۱. ساختار نهایی فایل‌ها

```
project/
├── server/                          ← بک‌اند (Node.js + TypeScript)
│   ├── src/
│   │   ├── app.ts                   ← نقطه ورود اصلی Express
│   │   ├── config/
│   │   │   └── index.ts             ← تمام متغیرهای محیطی
│   │   ├── db/
│   │   │   ├── pool.ts              ← اتصال mysql2/promise
│   │   │   └── migrate.ts           ← ساخت جداول MySQL
│   │   ├── auth/
│   │   │   ├── authController.ts    ← ورود + صدور JWT
│   │   │   └── phpass.ts            ← الگوریتم hash وردپرس
│   │   ├── middleware/
│   │   │   └── auth.ts              ← JWT middleware + requireAdmin
│   │   ├── ai/
│   │   │   ├── aiRouter.ts          ← هسته اصلی هوش مصنوعی + quota
│   │   │   ├── aiController.ts      ← endpoint های AI
│   │   │   └── encryption.ts        ← رمزگذاری AES-256 کلیدهای API
│   │   ├── content/
│   │   │   └── contentController.ts ← CRUD کامل + approve/reject
│   │   ├── wp/
│   │   │   └── wpProxy.ts           ← پروکسی WordPress REST API
│   │   ├── scheduler/
│   │   │   └── scheduler.ts         ← انتشار خودکار محتوای زمان‌بندی‌شده
│   │   ├── backup/
│   │   │   └── backup.ts            ← پشتیبان‌گیری + ارسال به Telegram
│   │   ├── monitoring/
│   │   │   └── logger.ts            ← Winston logger + ثبت لاگ در DB
│   │   └── routes/
│   │       └── index.ts             ← تمام مسیرهای API
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── client/                          ← فرانت‌اند (React + Vite + Tailwind)
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts            ← Axios با Bearer token interceptor
│   │   ├── store/
│   │   │   └── authStore.ts         ← Zustand + persist (token/user)
│   │   ├── components/
│   │   │   └── layout/
│   │   │       └── BottomNav.tsx    ← نوار ناوبری پایین (۵ تب)
│   │   ├── pages/
│   │   │   ├── Login.tsx            ← ورود با اطلاعات WordPress
│   │   │   ├── Dashboard.tsx        ← داشبورد + حلقه SVG سهمیه AI
│   │   │   ├── CreateContent.tsx    ← فرم داینامیک + زمان‌بندی
│   │   │   ├── ContentList.tsx      ← لیست + approve/reject ادمین
│   │   │   ├── MediaLibrary.tsx     ← کتابخانه + Image Editor
│   │   │   ├── ApiSettings.tsx      ← مدیریت کلیدهای شخصی AI
│   │   │   └── Monitoring.tsx       ← نمودار + لاگ‌های سیستم
│   │   ├── App.tsx                  ← Router + Layout
│   │   └── main.tsx
│   ├── tailwind.config.js
│   └── package.json
│
└── deploy/
    ├── mysql_migration.sql          ← اسکریپت آماده MySQL
    ├── DEPLOY_GUIDE.md              ← راهنمای نصب Hostinger
    └── PROJECT_REPORT.md            ← همین فایل
```

---

# ۲. منطق داینامیک فرم (CreateContent.tsx)

فرم بر اساس دو state اصلی کنترل می‌شود:
- **`type`**: نوع محتوا → `'article' | 'youtube' | 'podcast' | 'media'`
- **`lang`**: زبان → `'fa' | 'en' | 'both'`

### چطور کار می‌کند:

```tsx
// حالت type و lang به عنوان state نگه داشته می‌شود:
const [lang, setLang] = useState<Lang>('fa');
const [type, setType] = useState<ContentType>('article');

// در JSX، هر بلوک فیلد با شرط رندر می‌شود:

{/* فیلدهای فارسی — فقط اگر زبان fa یا both باشد */}
{(lang === 'fa' || lang === 'both') && (
  <div>
    <input placeholder="عنوان فارسی" ... />
    
    {/* محتوای متنی فقط برای مقاله نشان داده می‌شود */}
    {type === 'article' && (
      <textarea placeholder="محتوای فارسی..." ... />
    )}
    
    {/* دکمه‌های AI فقط برای مقاله */}
    <AIButtons ... />
  </div>
)}

{/* فیلد یوتیوب — فقط اگر type = youtube */}
{type === 'youtube' && (
  <input placeholder="https://youtube.com/watch?v=..." />
)}

{/* فیلد پادکست — فقط اگر type = podcast */}
{type === 'podcast' && (
  <input placeholder="https://..." />
)}
```

### نقشه تغییرات فیلد بر اساس type:

| type     | فیلدهای نمایش داده‌شده                          |
|----------|--------------------------------------------------|
| article  | عنوان FA/EN + محتوای FA/EN + دکمه‌های AI        |
| youtube  | عنوان FA/EN + فیلد لینک یوتیوب                  |
| podcast  | عنوان FA/EN + فیلد لینک پادکست                  |
| media    | عنوان FA/EN (بدون محتوا؛ تصویر از Media Library)|

همچنین بخش **زمان‌بندی** (datetime picker) همیشه نشان داده می‌شود و اختیاری است.

---

# ۳. استایل ظاهری (Tailwind Custom Colors)

### رنگ‌های اصلی تعریف‌شده در `tailwind.config.js`:

```js
colors: {
  bg:      '#0B0B0C',   // پس‌زمینه اصلی (تقریباً سیاه)
  surface: '#161618',   // پس‌زمینه کارت‌ها و پنل‌ها
  border:  '#1E1E21',   // خطوط جداکننده
  blue: {
    DEFAULT: '#0066FF', // رنگ اصلی برند (دکمه‌ها، لینک‌ها)
    hover:   '#0052CC', // hover دکمه آبی
    light:   '#1A75FF', // نسخه روشن‌تر
  },
  label:   '#8E8E93',   // متن‌های ثانویه و placeholder
  success: '#34C759',   // وضعیت منتشر شده (سبز)
  warning: '#FF9500',   // وضعیت در انتظار (نارنجی)
  danger:  '#FF3B30',   // وضعیت رد شده / خطا (قرمز)
}
```

### کلاس‌های Tailwind پرکاربرد در پروژه:

```
پس‌زمینه صفحات:      bg-bg (= #0B0B0C)
پس‌زمینه کارت:       bg-surface border border-border
دکمه اصلی (آبی):     bg-blue text-white hover:bg-blue-hover
دکمه ثانویه:         bg-surface border border-border text-white
متن ثانویه:          text-label (= #8E8E93)
متن اصلی:            text-white
وضعیت موفق:          text-success border-success/30 bg-success/10
وضعیت هشدار:         text-warning border-warning/30
وضعیت خطا:           text-danger border-danger/30
گوشه‌ها (rounded):   rounded-xl (16px) | rounded-2xl (20px)
shadow دکمه:          shadow-lg shadow-blue/40
blur نوار پایین:      bg-surface/95 backdrop-blur-sm
```

### نمونه بصری (رنگ‌ها):

```
████ #0B0B0C  ← bg (background اصلی)
████ #161618  ← surface (کارت‌ها)
████ #1E1E21  ← border
████ #0066FF  ← blue (اکشن‌ها)
████ #8E8E93  ← label (متن خاکستری)
████ #34C759  ← success (سبز)
████ #FF9500  ← warning (نارنجی)
████ #FF3B30  ← danger (قرمز)
```

---

# ۴. منطق دوزبانه (FA / EN / Both)

### در فرانت‌اند (CreateContent.tsx):

```tsx
type Lang = 'fa' | 'en' | 'both';

// state واحد برای تمام فیلدها:
const [form, setForm] = useState({
  title_fa: '', title_en: '',
  content_fa: '', content_en: '',
  youtube_url: '', podcast_url: '',
});

// رندر شرطی بلوک‌ها:
{(lang === 'fa' || lang === 'both') && (
  <div dir="rtl">
    <input value={form.title_fa} onChange={...} />
    <textarea value={form.content_fa} dir="rtl" ... />
    <AIButtons ... />  {/* دکمه‌های AI فارسی */}
  </div>
)}

{(lang === 'en' || lang === 'both') && (
  <div dir="ltr">
    <input value={form.title_en} onChange={...} />
    <textarea value={form.content_en} dir="ltr" ... />
  </div>
)}
```

### در بک‌اند (contentController.ts):

```typescript
// هنگام ذخیره، هر دو زبان جداگانه در ستون‌های مجزا ذخیره می‌شوند:
const {
  title_fa, title_en,      // عنوان دوزبانه
  content_fa, content_en,  // محتوای دوزبانه
  excerpt_fa, excerpt_en,  // خلاصه دوزبانه
} = req.body;
```

### در جدول MySQL (content_staging):

```sql
title_fa    TEXT,    -- عنوان فارسی
title_en    TEXT,    -- عنوان انگلیسی
content_fa  LONGTEXT,
content_en  LONGTEXT,
excerpt_fa  TEXT,
excerpt_en  TEXT,
lang        VARCHAR(20) DEFAULT 'fa'  -- 'fa' | 'en' | 'both'
```

### هنگام انتشار در WordPress:

```typescript
// اگر هر دو زبان باشند، فارسی اولویت دارد:
const wpData = {
  title:   row.title_fa   || row.title_en,
  content: row.content_fa || row.content_en,
  status:  'publish',
};
```

---

# ۵. بخش احراز هویت

### مسیر فایل: `server/src/auth/authController.ts`

سیستم احراز هویت **بدون اتصال مستقیم به دیتابیس WordPress** کار می‌کند (به دلایل امنیتی). در عوض از دو روش استفاده می‌شود:

### روش اول: JWT Plugin وردپرس

```typescript
async function validateViaWPAPI(username: string, password: string) {
  try {
    const res = await axios.post(
      `${config.wp.url}/wp-json/jwt-auth/v1/token`,
      { username, password },
      { timeout: 8000 }
    );
    // اگر token در پاسخ بود، ورود موفق است
    return res.data?.token ? res.data : null;
  } catch {
    return null;
  }
}
```

### روش دوم (fallback): Basic Auth وردپرس

```typescript
// اگر JWT Plugin نصب نباشد، از Basic Auth استفاده می‌شود:
const meRes = await axios.get(`${config.wp.url}/wp-json/wp/v2/users/me`, {
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
  },
  timeout: 8000,
});
// اگر پاسخ ۲۰۰ بود → کاربر معتبر است
wpUser = meRes.data;
role = meRes.data.roles?.includes('administrator') ? 'admin' : 'editor';
```

### صدور JWT پس از تأیید هویت:

```typescript
const userId = await upsertUser(wpUser, role);

const token = jwt.sign(
  { userId, wpUserId: wpUser.id, username, role },
  config.jwt.secret,         // حداقل ۶۴ کاراکتر تصادفی
  { expiresIn: '7d' }
);
```

### ذخیره کاربر در MySQL (همگام‌سازی با WP):

```typescript
// upsert — اگر کاربر وجود داشت update، اگر نه insert:
async function upsertUser(wpUser: any, role: string): Promise<number> {
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE wp_user_id = ?',
    [wpUser.id]
  );

  if (existing) {
    // بروزرسانی نام نمایشی و ایمیل
    await query(
      'UPDATE users SET display_name=?, email=?, updated_at=NOW() WHERE wp_user_id=?',
      [wpUser.name, wpUser.email, wpUser.id]
    );
    return existing.id;
  }

  // ایجاد کاربر جدید
  return queryInsert(
    'INSERT INTO users (wp_user_id, username, display_name, email, role) VALUES (?,?,?,?,?)',
    [wpUser.id, wpUser.slug, wpUser.name, wpUser.email, role]
  );
}
```

### نکته امنیتی مهم:
- به دیتابیس MySQL وردپرس **مستقیم** وصل نمی‌شویم
- احراز هویت از طریق WordPress REST API انجام می‌شود
- نقش ادمین از `roles` کاربر WordPress خوانده می‌شود
- رمز عبور هیچ‌گاه در سیستم ذخیره نمی‌شود

---

# ۶. بخش API شخصی (BYOK)

### فایل فرانت‌اند: `client/src/pages/ApiSettings.tsx`

```tsx
// ۶ provider تعریف شده:
const PROVIDERS = [
  { id: 'gemini',   name: 'Google Gemini',  model: 'gemini-2.0-flash' },
  { id: 'openai',   name: 'OpenAI GPT-4o',  model: 'gpt-4o' },
  { id: 'claude',   name: 'Claude Sonnet',  model: 'claude-sonnet-4-6' },
  { id: 'deepseek', name: 'DeepSeek',       model: 'deepseek-chat' },
  { id: 'grok',     name: 'Grok (xAI)',     model: 'grok-3-mini' },
  { id: 'mistral',  name: 'Mistral AI',     model: 'mistral-small-latest' },
];

// ذخیره کلید:
async function save(provider: string) {
  await api.post('/ai/keys', { provider, apiKey: inputs[provider] });
  // → کلید رمزگذاری شده در MySQL ذخیره می‌شود
}

// حذف کلید:
async function remove(provider: string) {
  await api.delete(`/ai/keys/${provider}`);
  // → is_active = 0 در جدول
}
```

### فایل بک‌اند (ذخیره): `server/src/ai/aiController.ts`

```typescript
export async function saveUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { provider, apiKey } = req.body;

  // رمزگذاری با AES-256 قبل از ذخیره:
  const encrypted = encrypt(apiKey.trim());
  
  await query(
    `INSERT INTO user_ai_keys (user_id, provider, api_key_enc, is_active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE api_key_enc=VALUES(api_key_enc), is_active=1`,
    [userId, provider, encrypted]
  );
}
```

### فایل رمزگذاری: `server/src/ai/encryption.ts`

```typescript
// الگوریتم: AES-256-CBC
const ALGO = 'aes-256-cbc';
const KEY  = Buffer.from(config.encryption.key);  // دقیقاً 32 کاراکتر

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

export function decrypt(data: string): string {
  const [ivHex, encHex] = data.split(':');
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}
```

### جدول MySQL برای کلیدها:

```sql
CREATE TABLE user_ai_keys (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  provider    VARCHAR(50) NOT NULL,
  api_key_enc TEXT NOT NULL,      -- کلید رمزگذاری شده با AES-256
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider)
);
```

### منطق اولویت‌بندی در هنگام استفاده از AI:

```typescript
// در aiRouter.ts — هنگام هر درخواست AI:
let apiKey = await getUserKey(userId, provider);   // اول کلید شخصی
let usedOwnKey = !!apiKey;

if (!apiKey) {
  // اگر کلید شخصی نداشت، سهمیه روزانه چک می‌شود:
  if (!(await checkQuota(userId))) {
    throw new Error('سهمیه روزانه تمام شده');
  }
  apiKey = config.ai.masterKeys[provider]; // کلید master ادمین
}
// → فقط اگر از کلید master استفاده شود، از سهمیه کم می‌شود
```

---

# جمع‌بندی ویژگی‌های کلی پروژه

| ویژگی                  | وضعیت | توضیح                                    |
|------------------------|--------|------------------------------------------|
| MySQL Migration        | ✅     | کامل — از pg به mysql2                  |
| احراز هویت WordPress  | ✅     | REST API + JWT — بدون دسترسی مستقیم DB  |
| ۶ هوش مصنوعی          | ✅     | Gemini, OpenAI, Claude, DeepSeek, Grok, Mistral |
| BYOK (کلید شخصی)      | ✅     | رمزگذاری AES-256 + سهمیه‌بندی          |
| فرم داینامیک          | ✅     | ۴ نوع محتوا + دوزبانه                   |
| سیستم تأیید محتوا     | ✅     | draft → pending → published/rejected     |
| زمان‌بندی انتشار      | ✅     | node-cron هر دقیقه                      |
| Image Editor           | ✅     | react-easy-crop + crop/zoom/rotation     |
| پشتیبان‌گیری خودکار  | ✅     | mysqldump + gzip + Telegram — هر ۲۴h    |
| نظارت و لاگ           | ✅     | Winston + ذخیره DB + نمودار Recharts    |
| امنیت                  | ✅     | Helmet, CORS, Rate Limit, JWT            |
| دیپلوی Hostinger       | ✅     | راهنما + migration SQL آماده            |

---

## نکات مهم برای دیپلوی

1. **ENCRYPTION_KEY** باید دقیقاً ۳۲ کاراکتر باشد
2. **JWT_SECRET** حداقل ۶۴ کاراکتر تصادفی
3. برای بکاپ Telegram، ربات باید با شما گفتگو کرده باشد تا `chat_id` فعال بشود
4. WordPress Application Password از مسیر Users > Profile > Application Passwords
5. `mysqldump` باید روی سرور Hostinger نصب باشد (معمولاً هست)

---

*این گزارش توسط Claude Code تولید شده است.*
*تاریخ: ۲۰۲۶-۰۵-۲۱*
