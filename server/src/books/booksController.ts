import axios from 'axios';
import { Request, Response } from 'express';
import { listBooks, streamDriveFile } from './driveService';
import { config } from '../config';

async function tgNotify(text: string) {
  if (!config.telegram.botToken || !config.telegram.adminChatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      chat_id: config.telegram.adminChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch { /* non-fatal */ }
}

// ── GET /books/list ────────────────────────────────────────────────────────────

export async function getDriveBooks(_req: Request, res: Response) {
  try {
    const books = await listBooks();
    return res.json({ books });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ── GET /books/info?q=title+author ────────────────────────────────────────────

export async function fetchBookInfo(req: Request, res: Response) {
  const q = (req.query.q as string)?.trim();
  if (!q) return res.status(400).json({ error: 'پارامتر q الزامی است' });

  try {
    const gbKey = config.googleBooksApiKey;

    // 1. Open Library — no key, no rate limit
    const olRes = await axios.get('https://openlibrary.org/search.json', {
      params: { q, limit: 3 },
      timeout: 10000,
    }).catch(() => null);

    const docs = olRes?.data?.docs || [];
    if (docs.length) {
      const d = docs[0];
      const result: any = {
        title:         d.title || '',
        subtitle:      '',
        authors:       d.author_name || [],
        description:   d.first_sentence?.[0] || '',
        publisher:     d.publisher?.[0] || '',
        publishedDate: String(d.first_publish_year || ''),
        coverUrl:      d.cover_i
          ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
          : null,
        isbn:          d.isbn?.[0] || null,
        pageCount:     d.number_of_pages_median || null,
        language:      d.language?.[0] || null,
        source:        'open_library',
      };
      // Enrich cover/description from Google Books if key available
      if (gbKey && (!result.coverUrl || !result.description)) {
        const gb = await fetchFromGoogleBooks(q, gbKey);
        if (gb) {
          if (!result.coverUrl   && gb.coverUrl)    result.coverUrl    = gb.coverUrl;
          if (!result.description && gb.description) result.description = gb.description;
        }
      }
      return res.json(result);
    }

    // 2. Google Books (only if API key set, to avoid 429)
    if (gbKey) {
      const gb = await fetchFromGoogleBooks(q, gbKey);
      if (gb) return res.json(gb);
    }

    return res.json({ title: null, authors: [], description: '', source: 'not_found' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

async function fetchFromGoogleBooks(q: string, key: string) {
  for (const lang of ['fa', undefined]) {
    const params: any = { q, maxResults: 3, key };
    if (lang) params.langRestrict = lang;
    const gbRes = await axios.get('https://www.googleapis.com/books/v1/volumes', {
      params, timeout: 8000,
    }).catch(() => null);
    const items = gbRes?.data?.items || [];
    if (items.length) {
      const v = items[0].volumeInfo;
      return {
        title:         v.title || '',
        subtitle:      v.subtitle || '',
        authors:       v.authors || [],
        description:   v.description || '',
        publisher:     v.publisher || '',
        publishedDate: v.publishedDate || '',
        coverUrl:      v.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
        isbn:          v.industryIdentifiers?.[0]?.identifier || null,
        pageCount:     v.pageCount || null,
        language:      v.language || null,
        source:        'google_books',
      };
    }
  }
  return null;
}

// ── POST /books/publish ────────────────────────────────────────────────────────

export async function publishBook(req: Request, res: Response) {
  const role    = (req as any).user.role;
  const {
    title, author, description, year, publisher,
    cover_url, drive_file_id, file_name, isbn, page_count,
    status = (role === 'admin' ? 'publish' : 'draft'),
  } = req.body;

  if (!title?.trim())       return res.status(400).json({ error: 'عنوان کتاب الزامی است' });
  if (!drive_file_id?.trim()) return res.status(400).json({ error: 'فایل PDF الزامی است' });

  const wpAuth = `Basic ${Buffer.from(`${config.wp.apiUser}:${config.wp.apiPassword}`).toString('base64')}`;
  const wpBase = config.wp.url;

  try {
    // 1. Upload cover image to WP media
    let featuredMediaId: number | null = null;
    if (cover_url?.trim()) {
      try {
        const imgRes = await axios.get(cover_url, { responseType: 'arraybuffer', timeout: 15000 });
        const ct  = (imgRes.headers['content-type'] as string) || 'image/jpeg';
        const ext = ct.includes('png') ? 'png' : 'jpg';
        const med = await axios.post(`${wpBase}/wp-json/wp/v2/media`, Buffer.from(imgRes.data), {
          headers: {
            Authorization:        wpAuth,
            'Content-Type':       ct,
            'Content-Disposition': `attachment; filename="book-cover-${Date.now()}.${ext}"`,
          },
          timeout: 30000,
        });
        featuredMediaId = med.data.id;
      } catch { /* continue without cover */ }
    }

    // 2. Download URL via our proxy endpoint
    const downloadUrl = `${config.clientUrl}/api/books/download/${drive_file_id}`;

    // 3. Build post content
    const content = buildContent({ author, description, year, publisher, isbn, page_count, downloadUrl, file_name });

    // 4. Create pa_book CPT post
    const postBody: any = {
      title,
      content,
      status,
      meta: {
        pa_book_author:    author     || '',
        pa_book_year:      year       || '',
        pa_book_publisher: publisher  || '',
        pa_book_isbn:      isbn       || '',
        pa_book_pages:     String(page_count || ''),
        pa_drive_file_id:  drive_file_id,
        pa_book_download:  downloadUrl,
        pa_book_cover:     cover_url  || '',
      },
    };
    if (featuredMediaId) postBody.featured_media = featuredMediaId;

    const wpPost = await axios.post(`${wpBase}/wp-json/wp/v2/pa_book`, postBody, {
      headers: { Authorization: wpAuth, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    const saved = wpPost.data;

    // Telegram notification when saved as draft (non-admin submitted for review)
    if (status === 'draft' && role !== 'admin') {
      const submitter = (req as any).user.username || 'کاربر';
      await tgNotify(
        `📚 <b>کتاب جدید در انتظار تأیید</b>\n\n` +
        `عنوان: ${title}\n` +
        `نویسنده: ${author || '—'}\n` +
        `ارسال‌کننده: ${submitter}\n\n` +
        `برای تأیید به مینی‌اپ بخش کتاب‌ها مراجعه کنید.`
      );
    }

    return res.json({
      success:  true,
      postId:   saved.id,
      postUrl:  saved.link,
      message:  `کتاب "${title}" ${status === 'publish' ? 'منتشر' : 'به‌عنوان پیش‌نویس ذخیره'} شد`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.response?.data?.message || err.message });
  }
}

// ── GET /books/drafts (admin) ──────────────────────────────────────────────────

export async function getDraftBooks(_req: Request, res: Response) {
  const wpAuth = `Basic ${Buffer.from(`${config.wp.apiUser}:${config.wp.apiPassword}`).toString('base64')}`;
  try {
    const r = await axios.get(`${config.wp.url}/wp-json/wp/v2/pa_book`, {
      params: { status: 'draft', per_page: 50, orderby: 'date', order: 'desc', _fields: 'id,title,date,link,meta' },
      headers: { Authorization: wpAuth },
      timeout: 10000,
    });
    const drafts = r.data.map((p: any) => ({
      id:        p.id,
      title:     p.title?.rendered || '',
      author:    p.meta?.pa_book_author || '',
      date:      p.date,
      postUrl:   p.link,
    }));
    return res.json({ drafts });
  } catch (err: any) {
    return res.status(500).json({ error: err.response?.data?.message || err.message });
  }
}

// ── POST /books/approve/:id (admin) ───────────────────────────────────────────

export async function approveBook(req: Request, res: Response) {
  const { id } = req.params;
  const wpAuth = `Basic ${Buffer.from(`${config.wp.apiUser}:${config.wp.apiPassword}`).toString('base64')}`;
  try {
    await axios.post(`${config.wp.url}/wp-json/wp/v2/pa_book/${id}`,
      { status: 'publish' },
      { headers: { Authorization: wpAuth, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.response?.data?.message || err.message });
  }
}

// ── DELETE /books/draft/:id (admin) ───────────────────────────────────────────

export async function deleteBookDraft(req: Request, res: Response) {
  const { id } = req.params;
  const wpAuth = `Basic ${Buffer.from(`${config.wp.apiUser}:${config.wp.apiPassword}`).toString('base64')}`;
  try {
    await axios.delete(`${config.wp.url}/wp-json/wp/v2/pa_book/${id}?force=true`,
      { headers: { Authorization: wpAuth }, timeout: 10000 }
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.response?.data?.message || err.message });
  }
}

// ── GET /books/download/:fileId (public) ──────────────────────────────────────

export async function downloadBook(req: Request, res: Response) {
  const { fileId } = req.params;
  try {
    const { stream, mimeType, fileName, size } = await streamDriveFile(fileId);
    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    if (size) res.setHeader('Content-Length', size);
    stream.pipe(res);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildContent({ author, description, year, publisher, isbn, page_count, downloadUrl, file_name }: any): string {
  const metaItems = [
    author    && `<span><strong>نویسنده:</strong> ${author}</span>`,
    year      && `<span><strong>سال:</strong> ${year}</span>`,
    publisher && `<span><strong>ناشر:</strong> ${publisher}</span>`,
    isbn      && `<span><strong>شابک:</strong> ${isbn}</span>`,
    page_count && `<span><strong>صفحات:</strong> ${page_count}</span>`,
  ].filter(Boolean).join('\n');

  return `<!-- wp:html -->
<div class="pa-book-card" dir="rtl">
${metaItems ? `  <div class="pa-book-meta">\n${metaItems}\n  </div>` : ''}
${description ? `  <div class="pa-book-description">${description}</div>` : ''}
  <div class="pa-book-download">
    <a href="${downloadUrl}" class="pa-download-btn" target="_blank" rel="noopener noreferrer">
      📥 دانلود کتاب PDF${file_name ? ` — ${file_name}` : ''}
    </a>
  </div>
</div>
<!-- /wp:html -->`;
}
