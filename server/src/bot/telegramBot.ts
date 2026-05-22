import axios from 'axios';
import { Request, Response } from 'express';
import { config } from '../config';
import { getPosts, wpRequest, createPost, updatePost, deletePost, uploadMedia } from '../wp/wpProxy';
import { logger } from '../monitoring/logger';

const BOT_API = `https://api.telegram.org/bot${config.telegram.botToken}`;
const ADMIN_CHAT_ID = config.telegram.adminChatId;

// In-memory conversation state per chat
type State =
  | { mode: 'idle' }
  | { mode: 'awaiting_post_content'; title: string }
  | { mode: 'awaiting_edit_field'; postId: number; field: 'title' | 'content' };

const states = new Map<string, State>();

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

function isAuthorized(chatId: string | number): boolean {
  if (!ADMIN_CHAT_ID) return false;
  return String(chatId) === String(ADMIN_CHAT_ID);
}

function stripHtml(s: string, max = 500): string {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Webhook entry ─────────────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response) {
  res.json({ ok: true }); // ack immediately so Telegram doesn't retry

  const update = req.body;
  try {
    if (update.message)              await handleMessage(update.message);
    else if (update.callback_query)  await handleCallback(update.callback_query);
  } catch (err: any) {
    logger.error('Bot webhook error', { error: err.message, stack: err.stack });
  }
}

// ── Message router ────────────────────────────────────────────────────────────
async function handleMessage(msg: any) {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    await sendMessage(chatId, `⛔ شما اجازه استفاده از این بات را ندارید.\nChat ID شما: <code>${chatId}</code>`);
    return;
  }

  // Files first (photo / video / audio / document)
  if (msg.photo || msg.video || msg.document || msg.audio || msg.voice) {
    await handleFileUpload(msg);
    return;
  }

  const text = (msg.text || '').trim();
  if (!text) return;

  // Commands always take precedence over conversation state
  if (text.startsWith('/')) {
    await handleCommand(chatId, text);
    return;
  }

  // Continue an in-progress conversation
  const state = states.get(String(chatId)) || { mode: 'idle' as const };

  if (state.mode === 'awaiting_post_content') {
    states.delete(String(chatId));
    await createNewPost(chatId, state.title, text);
    return;
  }

  if (state.mode === 'awaiting_edit_field') {
    states.delete(String(chatId));
    await applyEdit(chatId, state.postId, state.field, text);
    return;
  }

  await sendMessage(chatId, 'متوجه نشدم. /help برای راهنما.');
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function handleCommand(chatId: number, text: string) {
  const parts = text.split(/\s+/);
  const cmd   = parts[0].toLowerCase().split('@')[0];
  const args  = parts.slice(1);
  const arg   = args.join(' ');

  switch (cmd) {
    case '/start':  return sendWelcome(chatId);
    case '/help':   return sendHelp(chatId);
    case '/about':  return sendAbout(chatId);
    case '/list':   return listPosts(chatId, parseInt(args[0]) || 1);
    case '/new':    return startNewPost(chatId, arg);
    case '/get':
    case '/view':   return viewPost(chatId, parseInt(args[0]));
    case '/edit':   return startEdit(chatId, parseInt(args[0]));
    case '/delete': return askDelete(chatId, parseInt(args[0]));
    case '/cancel': return cancelConversation(chatId);
    case '/app':    return sendMessage(chatId, 'برای باز کردن مینی اپ روی دکمه پایین چت کلیک کن (🚀 ورود به اپ).');
    case '/id':
    case '/myid':   return sendMessage(chatId, `Chat ID: <code>${chatId}</code>`);
    default:        return sendMessage(chatId, '⚠️ دستور ناشناخته. /help');
  }
}

async function cancelConversation(chatId: number) {
  states.delete(String(chatId));
  await sendMessage(chatId, '✅ لغو شد.');
}

async function sendWelcome(chatId: number) {
  states.delete(String(chatId));
  const text = `سلام! 👋 من <b>رها</b> هستم.

از طریق این بات می‌تونی پست‌های وردپرس رو مدیریت کنی — حتی وقتی مینی اپ لود نشه.

<b>📋 دستورات اصلی</b>
/list — لیست پست‌ها
/new <i>عنوان</i> — پست جدید
/get <i>شماره</i> — مشاهده پست
/edit <i>شماره</i> — ویرایش پست
/delete <i>شماره</i> — حذف پست
/help — راهنمای کامل

<b>📎 آپلود فایل</b>
عکس، ویدیو، صدا یا سند رو مستقیم بفرست تا به وردپرس آپلود بشه.

<b>🚀 مینی اپ</b>
دکمه پایین چت ⬇️`;
  await sendMessage(chatId, text);
}

async function sendHelp(chatId: number) {
  const text = `<b>📚 راهنمای کامل</b>

<b>🔹 مشاهده و مدیریت</b>
/list [صفحه] — لیست پست‌ها (هر صفحه ۵ تا)
/get <i>۳۱</i> — جزئیات پست شماره ۳۱
/edit <i>۳۱</i> — انتخاب فیلد ویرایش
/delete <i>۳۱</i> — حذف پست (با تأیید)

<b>🔹 ایجاد پست</b>
/new <i>عنوان پست</i>
سپس متن پست رو ارسال کن. متن می‌تونه HTML داشته باشه.

<b>🔹 آپلود مدیا</b>
عکس / ویدیو / صدا / PDF رو مستقیم بفرست. URL مدیا برمی‌گرده.

<b>🔹 سایر</b>
/cancel — لغو عملیات در حال انجام
/myid — شناسه چت شما
/app — توضیح دسترسی به مینی اپ`;
  await sendMessage(chatId, text);
}

async function sendAbout(chatId: number) {
  await sendMessage(chatId,
    `🌿 <b>رها</b> — بات مدیریت محتوای وب‌سایت پرشین آتئیست\n\nنسخه ۱.۰ · ساخته شده با Claude Code`);
}

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

    const buttons: any[] = [];
    const nav: any[] = [];
    if (page > 1)     nav.push({ text: '◀️ قبلی', callback_data: `list:${page - 1}` });
    if (page < pages) nav.push({ text: 'بعدی ▶️', callback_data: `list:${page + 1}` });
    if (nav.length) buttons.push(nav);

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
      `✅ پست با موفقیت ساخته شد!\n\n<b>ID:</b> ${post.id}\n<b>عنوان:</b> ${escapeHtml(title)}\n<b>لینک:</b> ${post.link}`,
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

async function askDelete(chatId: number, id: number) {
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

  if (!isAuthorized(chatId)) return;

  const data: string = query.data || '';
  const [action, ...args] = data.split(':');

  if (action === 'list') {
    return listPosts(chatId, parseInt(args[0]) || 1);
  }

  if (action === 'edit') {
    const id    = parseInt(args[0]);
    const field = args[1] as 'title' | 'content';
    states.set(String(chatId), { mode: 'awaiting_edit_field', postId: id, field });
    const label = field === 'title' ? 'عنوان' : 'متن';
    await sendMessage(chatId, `${label} جدید برای پست #${id} رو ارسال کن.\nلغو: /cancel`);
    return;
  }

  if (action === 'askdel') {
    return askDelete(chatId, parseInt(args[0]));
  }

  if (action === 'delok') {
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
    return;
  }
}

// ── File upload ───────────────────────────────────────────────────────────────
async function handleFileUpload(msg: any) {
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
    fileId = msg.document.file_id;
    fallbackName = msg.document.file_name || `doc_${Date.now()}`;
    kind = 'سند';
  } else {
    return;
  }

  await sendMessage(chatId, `⬆️ در حال آپلود ${kind}...`);

  try {
    const { buffer, mime, name } = await downloadTelegramFile(fileId);
    // Prefer the file name we got from Telegram metadata if no extension was in path
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
