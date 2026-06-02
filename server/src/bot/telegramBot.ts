import axios from 'axios';
import { Request, Response } from 'express';
import pdfParseMod from 'pdf-parse';
const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
  (pdfParseMod as any).default ?? pdfParseMod;
import { config } from '../config';
import { runAI } from '../ai/aiRouter';
import { getPosts, wpRequest, createPost, updatePost, deletePost, uploadMedia } from '../wp/wpProxy';
import { query, queryOne, queryInsert } from '../db/pool';
import { logger } from '../monitoring/logger';

const BOT_API = `https://api.telegram.org/bot${config.telegram.botToken}`;
const ADMIN_CHAT_ID = config.telegram.adminChatId;

// ── State machine ─────────────────────────────────────────────────────────────
type State =
  | { mode: 'idle' }
  | { mode: 'awaiting_post_content'; title: string }
  | { mode: 'awaiting_edit_field'; postId: number; field: 'title' | 'content' }
  | { mode: 'awaiting_login_username' }
  | { mode: 'awaiting_login_password'; username: string };

const states = new Map<string, State>();
const translateModes = new Map<string, boolean>(); // per-chat translate toggle

interface AuthContext {
  userId: number;       // 0 for hard-coded admin chat
  role: 'admin' | 'editor';
  username: string;
}

// ── Telegram helpers ──────────────────────────────────────────────────────────
async function sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
  try {
    await axios.post(`${BOT_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup && { reply_markup: replyMarkup }),
    });
  } catch (err: any) {
    logger.error('sendMessage failed', { error: err.response?.data || err.message });
  }
}

async function deleteMessage(chatId: string | number, messageId: number) {
  try {
    await axios.post(`${BOT_API}/deleteMessage`, { chat_id: chatId, message_id: messageId });
  } catch { /* user may have already deleted, ignore */ }
}

async function answerCallback(callbackId: string, text?: string) {
  try {
    await axios.post(`${BOT_API}/answerCallbackQuery`, { callback_query_id: callbackId, text });
  } catch { /* non-fatal */ }
}

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; mime: string; name: string }> {
  const info = await axios.get(`${BOT_API}/getFile?file_id=${fileId}`);
  const filePath: string = info.data.result.file_path;
  const fileUrl  = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
  const res = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const name = filePath.split('/').pop() || 'upload';
  const mime = (res.headers['content-type'] as string) || 'application/octet-stream';
  return { buffer: Buffer.from(res.data), mime, name };
}

function stripHtml(s: string, max = 500): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function authorizeChat(chatId: number): Promise<AuthContext | null> {
  if (ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID)) {
    return { userId: 0, role: 'admin', username: 'admin' };
  }
  const row = await queryOne<{ id: number; role: string; username: string }>(
    'SELECT id, role, username FROM users WHERE telegram_chat_id = ? AND is_active = 1',
    [chatId]
  );
  if (!row) return null;
  return { userId: row.id, role: row.role === 'admin' ? 'admin' : 'editor', username: row.username };
}

async function validateWPCredentials(username: string, password: string):
  Promise<{ wpUserId: number; roles: string[]; email: string | null; displayName: string } | null>
{
  try {
    const res = await axios.post(
      `${config.wp.url}/wp-json/jwt-auth/v1/token`,
      { username, password },
      { timeout: 8000 }
    );
    const wpToken = res.data?.data?.token ? res.data.data : res.data;
    if (!wpToken?.token) return null;

    const wpUserId = wpToken.id ?? wpToken.user_id ?? null;
    if (!wpUserId) return null;

    let roles: string[] = wpToken.user_roles ?? [];
    let displayName = wpToken.displayName ?? wpToken.user_display_name ?? wpToken.nicename ?? username;
    let email       = wpToken.email ?? wpToken.user_email ?? null;

    if (!roles.length) {
      try {
        const meRes = await axios.get(
          `${config.wp.url}/wp-json/wp/v2/users/${wpUserId}?context=edit`,
          { headers: { Authorization: `Bearer ${wpToken.token}` }, timeout: 8000 }
        );
        roles = meRes.data?.roles ?? [];
        displayName = meRes.data?.name || displayName;
        email = meRes.data?.email || email;
      } catch { /* fall through */ }
    }

    return { wpUserId, roles, email, displayName };
  } catch {
    return null;
  }
}

async function linkTelegramAccount(
  wpUserId: number, chatId: number, username: string, displayName: string, email: string | null, roles: string[]
): Promise<AuthContext> {
  const role = roles.includes('administrator') ? 'admin' : 'editor';

  // First, unlink any other user previously linked to this chatId (avoid UNIQUE collision)
  await query('UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = ? AND wp_user_id <> ?', [chatId, wpUserId]);

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE wp_user_id = ?',
    [wpUserId]
  );

  let userId: number;
  if (existing) {
    await query(
      'UPDATE users SET telegram_chat_id=?, display_name=?, email=?, role=?, updated_at=NOW() WHERE wp_user_id=?',
      [chatId, displayName, email, role, wpUserId]
    );
    userId = existing.id;
  } else {
    userId = await queryInsert(
      'INSERT INTO users (wp_user_id, username, display_name, email, role, telegram_chat_id) VALUES (?, ?, ?, ?, ?, ?)',
      [wpUserId, username, displayName, email, role, chatId]
    );
  }

  return { userId, role, username };
}

// Commands available without login
const PUBLIC_COMMANDS = new Set(['/start', '/help', '/about', '/login', '/myid', '/id', '/cancel', '/app', '/translate']);

// ── Webhook entry ─────────────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response) {
  res.json({ ok: true }); // ack immediately

  const update = req.body;
  try {
    if (update.message)             await handleMessage(update.message);
    else if (update.callback_query) await handleCallback(update.callback_query);
  } catch (err: any) {
    logger.error('Bot webhook error', { error: err.message, stack: err.stack });
  }
}

// ── Message router ────────────────────────────────────────────────────────────
async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const auth   = await authorizeChat(chatId);
  const state  = states.get(String(chatId)) || { mode: 'idle' as const };

  // Login flow takes priority over everything else for current state
  if (state.mode === 'awaiting_login_username' && msg.text) {
    await handleLoginUsername(chatId, msg.text.trim());
    return;
  }
  if (state.mode === 'awaiting_login_password' && msg.text) {
    await handleLoginPassword(chatId, state.username, msg.text, msg.message_id);
    return;
  }

  // Files require auth
  if (msg.photo || msg.video || msg.document || msg.audio || msg.voice) {
    if (!auth) return promptLogin(chatId);
    await handleFileUpload(msg, auth);
    return;
  }

  const text = (msg.text || '').trim();
  if (!text) return;

  // Commands
  if (text.startsWith('/')) {
    const cmd = text.split(/\s+/)[0].toLowerCase().split('@')[0];
    if (!auth && !PUBLIC_COMMANDS.has(cmd)) {
      return promptLogin(chatId);
    }
    await handleCommand(chatId, text, auth);
    return;
  }

  // Non-command text in active conversation
  if (state.mode === 'awaiting_post_content') {
    if (!auth) return promptLogin(chatId);
    states.delete(String(chatId));
    await createNewPost(chatId, state.title, text);
    return;
  }

  if (state.mode === 'awaiting_edit_field') {
    if (!auth) return promptLogin(chatId);
    states.delete(String(chatId));
    await applyEdit(chatId, state.postId, state.field, text);
    return;
  }

  if (!auth) return promptLogin(chatId);

  // Auto-translate Persian text (only when translate mode is on)
  if (translateModes.get(String(chatId)) && isPersian(text)) {
    await handleTranslation(chatId, auth.userId, text);
    return;
  }

  await sendMessage(chatId, 'متوجه نشدم. /help برای راهنما.');
}

async function promptLogin(chatId: number) {
  await sendMessage(chatId,
    `🔒 برای استفاده از این بات ابتدا باید وارد شوید.\n\nدستور /login را بفرستید تا با حساب وردپرس خود وارد شوید.`);
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function handleCommand(chatId: number, text: string, auth: AuthContext | null) {
  const parts = text.split(/\s+/);
  const cmd   = parts[0].toLowerCase().split('@')[0];
  const args  = parts.slice(1);
  const arg   = args.join(' ');

  switch (cmd) {
    // Public
    case '/start':  return sendWelcome(chatId, auth);
    case '/help':   return sendHelp(chatId, auth);
    case '/about':  return sendAbout(chatId);
    case '/login':  return startLogin(chatId, auth);
    case '/cancel': return cancelConversation(chatId);
    case '/app':    return sendMessage(chatId, 'برای باز کردن مینی اپ روی دکمه پایین چت کلیک کن (🚀 ورود به اپ).');
    case '/id':
    case '/myid':   return sendMessage(chatId, `Chat ID: <code>${chatId}</code>`);
    case '/translate': return toggleTranslate(chatId);

    // Authenticated
    case '/logout': return doLogout(chatId, auth!);
    case '/me':     return showMe(chatId, auth!);
    case '/list':   return listPosts(chatId, parseInt(args[0]) || 1);
    case '/new':    return startNewPost(chatId, arg);
    case '/get':
    case '/view':   return viewPost(chatId, parseInt(args[0]));
    case '/edit':   return startEdit(chatId, parseInt(args[0]));
    case '/delete': return askDelete(chatId, parseInt(args[0]), auth!);

    default: return sendMessage(chatId, '⚠️ دستور ناشناخته. /help');
  }
}

async function cancelConversation(chatId: number) {
  states.delete(String(chatId));
  await sendMessage(chatId, '✅ لغو شد.');
}

async function toggleTranslate(chatId: number) {
  const key = String(chatId);
  const current = translateModes.get(key) ?? false;
  const next = !current;
  translateModes.set(key, next);
  await sendMessage(chatId,
    next
      ? '🌐 حالت ترجمه <b>فعال</b> شد.\n\nهر متن فارسی که بفرستی به انگلیسی آکادمیک ترجمه می‌شه.\nبرای خاموش کردن دوباره /translate بزن.'
      : '🔇 حالت ترجمه <b>غیرفعال</b> شد.'
  );
}

async function sendWelcome(chatId: number, auth: AuthContext | null) {
  states.delete(String(chatId));
  if (!auth) {
    await sendMessage(chatId,
      `سلام! 👋 من <b>رها</b> هستم.\n\nبرای استفاده از بات اول باید وارد بشی. دستور /login رو بفرست.\n\n🚀 یا می‌تونی روی دکمه پایین چت کلیک کنی تا مینی اپ باز بشه.`);
    return;
  }

  const text = `سلام <b>${escapeHtml(auth.username)}</b> 👋

<b>📋 دستورات اصلی</b>
/list — لیست پست‌ها
/new <i>عنوان</i> — پست جدید
/get <i>شماره</i> — مشاهده پست
/edit <i>شماره</i> — ویرایش
/delete <i>شماره</i> — حذف
/me — وضعیت حساب
/logout — خروج
/help — راهنمای کامل

📎 برای آپلود، فایل رو مستقیم بفرست.`;
  await sendMessage(chatId, text);
}

async function sendHelp(chatId: number, auth: AuthContext | null) {
  const loginNote = auth
    ? `وارد شدید با: <b>${escapeHtml(auth.username)}</b> (${auth.role === 'admin' ? 'مدیر' : 'ویرایشگر'})`
    : `<i>هنوز وارد نشدید. /login برای ورود.</i>`;

  const text = `<b>📚 راهنما</b>

${loginNote}

<b>🔹 ورود</b>
/login — ورود با یوزر/پس وردپرس
/logout — خروج
/me — حساب فعلی

<b>🔹 مشاهده و مدیریت</b>
/list [صفحه] — لیست پست‌ها (هر صفحه ۵ تا)
/get <i>۳۱</i> — جزئیات پست
/edit <i>۳۱</i> — انتخاب فیلد ویرایش
/delete <i>۳۱</i> — حذف (فقط مدیر)

<b>🔹 ایجاد پست</b>
/new <i>عنوان پست</i>
سپس متن پست رو بفرست.

<b>🔹 آپلود مدیا</b>
عکس / ویدیو / صدا رو بفرست.

<b>🔹 ترجمه آکادمیک</b>
/translate — روشن/خاموش کردن حالت ترجمه
وقتی فعاله، متن فارسی + PDF + TXT ترجمه می‌شن.

<b>🔹 سایر</b>
/cancel — لغو عملیات
/myid — Chat ID شما`;
  await sendMessage(chatId, text);
}

async function sendAbout(chatId: number) {
  await sendMessage(chatId,
    `🌿 <b>رها</b> — بات مدیریت محتوای وب‌سایت پرشین آتئیست\n\nنسخه ۱.۱ · ساخته شده با Claude Code`);
}

// ── Login / Logout ────────────────────────────────────────────────────────────
async function startLogin(chatId: number, auth: AuthContext | null) {
  if (auth) {
    await sendMessage(chatId, `شما قبلاً وارد شدید با <b>${escapeHtml(auth.username)}</b>.\nبرای خروج: /logout`);
    return;
  }
  states.set(String(chatId), { mode: 'awaiting_login_username' });
  await sendMessage(chatId, `🔑 <b>ورود</b>\n\nنام کاربری وردپرس خودت رو بفرست.\nبرای لغو: /cancel`);
}

async function handleLoginUsername(chatId: number, username: string) {
  if (username.startsWith('/')) {
    states.delete(String(chatId));
    await sendMessage(chatId, '✅ ورود لغو شد.');
    return;
  }
  states.set(String(chatId), { mode: 'awaiting_login_password', username });
  await sendMessage(chatId,
    `🔐 رمز عبور وردپرس رو ارسال کن.\n\n⚠️ <b>توجه:</b> پیام رمز بلافاصله بعد از دریافت حذف می‌شود.\n\nلغو: /cancel`);
}

async function handleLoginPassword(chatId: number, username: string, password: string, msgId: number) {
  // Always clear state first, even on errors
  states.delete(String(chatId));

  // Delete the password message right away
  await deleteMessage(chatId, msgId);

  if (password.startsWith('/')) {
    await sendMessage(chatId, '✅ ورود لغو شد.');
    return;
  }

  await sendMessage(chatId, '⏳ در حال اعتبارسنجی...');

  const creds = await validateWPCredentials(username, password);
  if (!creds) {
    await sendMessage(chatId, '❌ نام کاربری یا رمز عبور اشتباه است. /login برای تلاش مجدد.');
    return;
  }

  try {
    const ctx = await linkTelegramAccount(
      creds.wpUserId, chatId, username, creds.displayName, creds.email, creds.roles
    );
    const roleLabel = ctx.role === 'admin' ? 'مدیر' : 'ویرایشگر';
    await sendMessage(chatId,
      `✅ خوش اومدی <b>${escapeHtml(creds.displayName)}</b>!\n\nنقش: <b>${roleLabel}</b>\n\n/help برای راهنما`);
  } catch (err: any) {
    logger.error('Telegram link failed', { error: err.message });
    await sendMessage(chatId, `❌ خطا در ذخیره حساب: ${escapeHtml(err.message)}`);
  }
}

async function doLogout(chatId: number, auth: AuthContext) {
  if (auth.userId === 0) {
    await sendMessage(chatId, '⚠️ ادمین اصلی نمی‌تونه از طریق بات logout کنه.');
    return;
  }
  await query('UPDATE users SET telegram_chat_id = NULL WHERE id = ?', [auth.userId]);
  states.delete(String(chatId));
  await sendMessage(chatId, '👋 خروج موفق. برای ورود مجدد: /login');
}

async function showMe(chatId: number, auth: AuthContext) {
  if (auth.userId === 0) {
    await sendMessage(chatId, `👤 <b>ادمین اصلی</b>\nChat ID: <code>${chatId}</code>\nنقش: مدیر`);
    return;
  }
  const row = await queryOne<any>(
    'SELECT username, display_name, email, role, created_at FROM users WHERE id = ?',
    [auth.userId]
  );
  if (!row) return sendMessage(chatId, '❌ حساب پیدا نشد.');
  await sendMessage(chatId,
    `👤 <b>${escapeHtml(row.display_name || row.username)}</b>\n` +
    `یوزرنیم: <code>${escapeHtml(row.username)}</code>\n` +
    `ایمیل: ${escapeHtml(row.email || '-')}\n` +
    `نقش: ${row.role === 'admin' ? 'مدیر' : 'ویرایشگر'}\n` +
    `Chat ID: <code>${chatId}</code>`);
}

// ── Post operations ───────────────────────────────────────────────────────────
async function listPosts(chatId: number, page: number) {
  try {
    const { posts, total, pages } = await getPosts({ page, per_page: 5 });
    if (!posts.length) {
      await sendMessage(chatId, 'پستی یافت نشد.');
      return;
    }

    let text = `<b>📋 پست‌ها</b> — ${total} پست (صفحه ${page} از ${pages})\n\n`;
    for (const p of posts) {
      const title = stripHtml(p.title?.rendered || '', 80);
      const date  = new Date(p.date).toLocaleDateString('fa-IR');
      const status = p.status === 'publish' ? '✅' : p.status === 'draft' ? '📝' : '⏳';
      text += `${status} <b>#${p.id}</b> — ${escapeHtml(title)}\n   📅 ${date}\n\n`;
    }

    const nav: any[] = [];
    if (page > 1)     nav.push({ text: '◀️ قبلی', callback_data: `list:${page - 1}` });
    if (page < pages) nav.push({ text: 'بعدی ▶️', callback_data: `list:${page + 1}` });
    const buttons = nav.length ? [nav] : [];

    text += `<i>/get ۳۱ — مشاهده | /edit ۳۱ — ویرایش</i>`;
    await sendMessage(chatId, text, buttons.length ? { inline_keyboard: buttons } : undefined);
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا: ${escapeHtml(err.message)}`);
  }
}

async function viewPost(chatId: number, id: number) {
  if (!id) {
    await sendMessage(chatId, 'شماره پست رو هم بفرست. مثال: <code>/get 31</code>');
    return;
  }
  try {
    const post  = await wpRequest('GET', `/posts/${id}`);
    const title = stripHtml(post.title?.rendered || '', 200);
    const body  = stripHtml(post.content?.rendered || '', 1500);
    const date  = new Date(post.date).toLocaleDateString('fa-IR');

    const text = `<b>📄 پست #${id}</b>

<b>عنوان:</b> ${escapeHtml(title)}
<b>تاریخ:</b> ${date}
<b>وضعیت:</b> ${post.status}

<b>متن:</b>
${escapeHtml(body)}${body.length >= 1500 ? '...' : ''}`;

    await sendMessage(chatId, text, {
      inline_keyboard: [
        [
          { text: '✏️ ویرایش عنوان', callback_data: `edit:${id}:title` },
          { text: '📝 ویرایش متن',   callback_data: `edit:${id}:content` },
        ],
        [
          { text: '🔗 باز کردن',      url: post.link },
          { text: '🗑 حذف',           callback_data: `askdel:${id}` },
        ],
      ],
    });
  } catch (err: any) {
    const msg = err.response?.status === 404 ? `پست #${id} پیدا نشد.` : err.message;
    await sendMessage(chatId, `❌ ${escapeHtml(msg)}`);
  }
}

async function startNewPost(chatId: number, title: string) {
  if (!title) {
    await sendMessage(chatId, 'عنوان پست رو هم بفرست. مثال:\n<code>/new عنوان پست جدید</code>');
    return;
  }
  states.set(String(chatId), { mode: 'awaiting_post_content', title });
  await sendMessage(chatId,
    `✅ عنوان ثبت شد: <b>${escapeHtml(title)}</b>\n\nحالا متن پست رو ارسال کن (HTML پشتیبانی میشه).\n\nبرای لغو: /cancel`);
}

async function createNewPost(chatId: number, title: string, content: string) {
  try {
    const post = await createPost({ title, content, status: 'publish' });
    await sendMessage(chatId,
      `✅ پست با موفقیت ساخته شد!\n\n<b>ID:</b> ${post.id}\n<b>عنوان:</b> ${escapeHtml(title)}`,
      { inline_keyboard: [[{ text: '🔗 مشاهده در سایت', url: post.link }]] });
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا در ایجاد پست: ${escapeHtml(err.message)}`);
  }
}

async function startEdit(chatId: number, id: number) {
  if (!id) {
    await sendMessage(chatId, 'شماره پست رو بفرست. مثال: <code>/edit 31</code>');
    return;
  }
  await sendMessage(chatId, `چه فیلدی از پست <b>#${id}</b> رو ویرایش می‌کنی؟`, {
    inline_keyboard: [[
      { text: '✏️ عنوان', callback_data: `edit:${id}:title` },
      { text: '📝 متن',   callback_data: `edit:${id}:content` },
    ]],
  });
}

async function applyEdit(chatId: number, id: number, field: 'title' | 'content', value: string) {
  try {
    await updatePost(id, { [field]: value });
    const label = field === 'title' ? 'عنوان' : 'متن';
    await sendMessage(chatId, `✅ ${label} پست #${id} بروزرسانی شد.`);
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا در ویرایش: ${escapeHtml(err.message)}`);
  }
}

async function askDelete(chatId: number, id: number, auth: AuthContext) {
  if (auth.role !== 'admin') {
    await sendMessage(chatId, '⛔ فقط مدیر می‌تونه پست رو حذف کنه.');
    return;
  }
  if (!id) {
    await sendMessage(chatId, 'شماره پست رو بفرست. مثال: <code>/delete 31</code>');
    return;
  }
  await sendMessage(chatId, `⚠️ پست <b>#${id}</b> به‌طور دائمی حذف می‌شود. مطمئنی؟`, {
    inline_keyboard: [[
      { text: '✅ بله، حذف کن', callback_data: `delok:${id}` },
      { text: '❌ لغو',          callback_data: 'cancel' },
    ]],
  });
}

// ── Callback router ───────────────────────────────────────────────────────────
async function handleCallback(query: any) {
  const chatId = query.message.chat.id;
  await answerCallback(query.id);

  const auth = await authorizeChat(chatId);
  if (!auth) {
    await sendMessage(chatId, '🔒 برای انجام این عمل ابتدا وارد شوید: /login');
    return;
  }

  const data: string = query.data || '';
  const [action, ...args] = data.split(':');

  if (action === 'list')   return listPosts(chatId, parseInt(args[0]) || 1);
  if (action === 'askdel') return askDelete(chatId, parseInt(args[0]), auth);

  if (action === 'edit') {
    const id    = parseInt(args[0]);
    const field = args[1] as 'title' | 'content';
    states.set(String(chatId), { mode: 'awaiting_edit_field', postId: id, field });
    const label = field === 'title' ? 'عنوان' : 'متن';
    await sendMessage(chatId, `${label} جدید برای پست #${id} رو ارسال کن.\nلغو: /cancel`);
    return;
  }

  if (action === 'delok') {
    if (auth.role !== 'admin') {
      await sendMessage(chatId, '⛔ فقط مدیر اجازه حذف داره.');
      return;
    }
    try {
      await deletePost(parseInt(args[0]));
      await sendMessage(chatId, `🗑 پست #${args[0]} حذف شد.`);
    } catch (err: any) {
      await sendMessage(chatId, `❌ خطا: ${escapeHtml(err.message)}`);
    }
    return;
  }

  if (action === 'cancel') {
    states.delete(String(chatId));
    await sendMessage(chatId, '✅ لغو شد.');
  }
}

// ── Translation ───────────────────────────────────────────────────────────────

function isPersian(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

function splitIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxLen;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastPeriod > start + maxLen / 2) end = lastPeriod + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

const TRANSLATE_PROMPT = (text: string) =>
  `You are a professional academic translator specializing in Persian to English translation.
Translate the following Persian text to formal, academic English suitable for scholarly publications and journalism.
Use precise vocabulary, maintain the original meaning exactly, and write in a style appropriate for academic papers or quality newspapers.
Output ONLY the English translation — no explanations, no notes, no prefixes.

Persian text:
${text}`;

async function translateText(userId: number, text: string): Promise<string> {
  // Uses user's own saved Claude key → admin global key → master env key (with quota)
  const { result } = await runAI(userId, 'claude', TRANSLATE_PROMPT(text), 'translate');
  return result.trim();
}

async function sendTranslation(chatId: number, translated: string, label = '') {
  const header = label ? `📄 <b>${escapeHtml(label)}</b>\n\n` : '';
  const chunks  = splitIntoChunks(translated, 3500);

  for (let i = 0; i < chunks.length; i++) {
    const prefix = i === 0
      ? `${header}🇬🇧 <b>Academic Translation${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}</b>\n\n`
      : `<b>(${i + 1}/${chunks.length})</b>\n\n`;
    await sendMessage(chatId, prefix + escapeHtml(chunks[i]));
  }
}

async function handleTranslation(chatId: number, userId: number, text: string, label = '') {
  if (text.length < 10) return;
  await sendMessage(chatId, '🔄 در حال ترجمه...');
  try {
    const translated = await translateText(userId, text);
    await sendTranslation(chatId, translated, label);
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا در ترجمه: ${escapeHtml(err.message)}`);
  }
}

async function handlePdfTranslation(chatId: number, userId: number, fileId: string, fileName: string) {
  await sendMessage(chatId, `📄 در حال استخراج متن از <b>${escapeHtml(fileName)}</b>...`);
  try {
    const { buffer } = await downloadTelegramFile(fileId);
    const pdf  = await pdfParse(buffer);
    const text = pdf.text.trim();
    if (!text) {
      await sendMessage(chatId, '⚠️ متنی در این PDF یافت نشد (احتمالاً اسکن‌شده است).');
      return;
    }
    if (!isPersian(text)) {
      await sendMessage(chatId, '⚠️ متن فارسی در این PDF تشخیص داده نشد.');
      return;
    }
    await handleTranslation(chatId, userId, text, fileName);
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا در خواندن PDF: ${escapeHtml(err.message)}`);
  }
}

async function handleTextFileTranslation(chatId: number, userId: number, fileId: string, fileName: string) {
  await sendMessage(chatId, `📄 در حال خواندن <b>${escapeHtml(fileName)}</b>...`);
  try {
    const { buffer } = await downloadTelegramFile(fileId);
    const text = buffer.toString('utf-8').trim();
    if (!isPersian(text)) {
      await sendMessage(chatId, '⚠️ متن فارسی در این فایل تشخیص داده نشد.');
      return;
    }
    await handleTranslation(chatId, userId, text, fileName);
  } catch (err: any) {
    await sendMessage(chatId, `❌ خطا در خواندن فایل: ${escapeHtml(err.message)}`);
  }
}

// ── File upload ───────────────────────────────────────────────────────────────
async function handleFileUpload(msg: any, auth: AuthContext) {
  const chatId = msg.chat.id;

  let fileId: string;
  let fallbackName = '';
  let kind = 'فایل';

  if (msg.photo) {
    fileId = msg.photo[msg.photo.length - 1].file_id;
    fallbackName = `photo_${Date.now()}.jpg`;
    kind = 'تصویر';
  } else if (msg.video) {
    fileId = msg.video.file_id;
    fallbackName = msg.video.file_name || `video_${Date.now()}.mp4`;
    kind = 'ویدیو';
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    fallbackName = msg.audio.file_name || `audio_${Date.now()}.mp3`;
    kind = 'صوت';
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    fallbackName = `voice_${Date.now()}.ogg`;
    kind = 'پیام صوتی';
  } else if (msg.document) {
    const mime     = (msg.document.mime_type || '') as string;
    const fname    = (msg.document.file_name || '') as string;
    const isPdf    = mime === 'application/pdf' || fname.toLowerCase().endsWith('.pdf');
    const isTxt    = mime === 'text/plain'      || fname.toLowerCase().endsWith('.txt');

    const tMode = translateModes.get(String(chatId)) ?? false;
    if (tMode && isPdf) {
      await handlePdfTranslation(chatId, auth.userId, msg.document.file_id, fname || 'document.pdf');
      return;
    }
    if (tMode && isTxt) {
      await handleTextFileTranslation(chatId, auth.userId, msg.document.file_id, fname || 'file.txt');
      return;
    }

    fileId = msg.document.file_id;
    fallbackName = fname || `doc_${Date.now()}`;
    kind = 'سند';
  } else {
    return;
  }

  await sendMessage(chatId, `⬆️ در حال آپلود ${kind}...`);

  try {
    const { buffer, mime, name } = await downloadTelegramFile(fileId);
    const finalName = (name.includes('.') ? name : fallbackName) || fallbackName;
    const result = await uploadMedia(buffer, finalName, mime);
    await sendMessage(chatId,
      `✅ آپلود شد!\n\n<b>ID:</b> ${result.id}\n<b>نام:</b> ${escapeHtml(finalName)}\n<b>URL:</b> ${result.source_url}`,
      { inline_keyboard: [[{ text: '🔗 باز کردن', url: result.source_url }]] });
  } catch (err: any) {
    const msg = err.response?.status === 413 ? 'فایل خیلی بزرگ است (محدودیت تلگرام ۲۰MB).' : err.message;
    await sendMessage(chatId, `❌ خطا در آپلود: ${escapeHtml(msg)}`);
  }
}
