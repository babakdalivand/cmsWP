import axios from 'axios';
import { Request, Response } from 'express';
import { listBooks, streamDriveFile } from './driveService';
import { config } from '../config';

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
    // Try Google Books (Persian first)
    for (const lang of ['fa', undefined]) {
      const params: any = { q, maxResults: 3 };
      if (lang) params.langRestrict = lang;

      const gbRes = await axios.get('https://www.googleapis.com/books/v1/volumes', {
        params,
        timeout: 8000,
      }).catch(() => null);

      const items = gbRes?.data?.items || [];
      if (items.length) {
        const v = items[0].volumeInfo;
        return res.json({
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
        });
      }
    }

    // Fallback: Open Library
    const olRes = await axios.get('https://openlibrary.org/search.json', {
      params: { q, limit: 1 },
      timeout: 8000,
    }).catch(() => null);

    const docs = olRes?.data?.docs || [];
    if (docs.length) {
      const d = docs[0];
      return res.json({
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
      });
    }

    return res.json({ title: null, authors: [], description: '', source: 'not_found' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
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

    // 2. Ensure "books" category exists
    const catId = await getOrCreateCategory(wpBase, wpAuth);

    // 3. Download URL via our proxy endpoint
    const downloadUrl = `${config.clientUrl}/api/books/download/${drive_file_id}`;

    // 4. Build post content
    const content = buildContent({ author, description, year, publisher, isbn, page_count, downloadUrl, file_name });

    // 5. Create WP post
    const postBody: any = {
      title,
      content,
      status,
      categories: [catId],
      meta: {
        _pa_book_author:      author     || '',
        _pa_book_year:        year       || '',
        _pa_book_publisher:   publisher  || '',
        _pa_book_isbn:        isbn       || '',
        _pa_book_pages:       String(page_count || ''),
        _pa_drive_file_id:    drive_file_id,
        _pa_book_download:    downloadUrl,
      },
    };
    if (featuredMediaId) postBody.featured_media = featuredMediaId;

    const wpPost = await axios.post(`${wpBase}/wp-json/wp/v2/posts`, postBody, {
      headers: { Authorization: wpAuth, 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    return res.json({
      success:  true,
      postId:   wpPost.data.id,
      postUrl:  wpPost.data.link,
      message:  `کتاب "${title}" ${status === 'publish' ? 'منتشر' : 'به‌عنوان پیش‌نویس ذخیره'} شد`,
    });
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

async function getOrCreateCategory(wpBase: string, auth: string): Promise<number> {
  try {
    const res = await axios.get(`${wpBase}/wp-json/wp/v2/categories`, {
      params:  { slug: 'books', per_page: 1 },
      headers: { Authorization: auth },
      timeout: 10000,
    });
    if (res.data.length) return res.data[0].id as number;

    const cr = await axios.post(`${wpBase}/wp-json/wp/v2/categories`,
      { name: 'کتاب‌ها', slug: 'books', description: 'کتاب‌های دیجیتال' },
      { headers: { Authorization: auth, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return cr.data.id as number;
  } catch {
    return 1;
  }
}

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
