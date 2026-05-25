import { Request, Response } from 'express';
import { query, queryOne, queryInsert } from '../db/pool';
import { createPost, updatePost, deletePost, rahaLinkTranslation } from '../wp/wpProxy';
import { dbLog } from '../monitoring/logger';

export async function listContent(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const role   = (req as any).user.role;
  const { status = 'all', page = 1, limit = 20 } = req.query;

  let sql = `SELECT c.*, u.display_name as author_name
             FROM content_staging c
             LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
  const params: any[] = [];

  if (role !== 'admin') {
    params.push(userId);
    sql += ' AND c.user_id = ?';
  }
  if (status !== 'all') {
    params.push(status);
    sql += ' AND c.status = ?';
  }

  sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const rows = await query(sql, params);
  return res.json({ content: rows, page: Number(page) });
}

export async function getContent(req: Request, res: Response) {
  const row = await queryOne('SELECT * FROM content_staging WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'محتوا یافت نشد' });
  return res.json(row);
}

export async function createContent(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const {
    content_type = 'article', lang = 'fa',
    title_fa, title_en, content_fa, content_en,
    excerpt_fa, excerpt_en, youtube_url, podcast_url,
    embed_provider, featured_media, categories, scheduled_at,
  } = req.body;

  const status = scheduled_at ? 'scheduled' : 'draft';

  // mysql2 throws "Bind parameters must not contain undefined" — coerce all
  // optional fields to null so a missing featured_media / excerpt / etc.
  // doesn't crash the Node process and return 503.
  const n = (v: any) => (v === undefined || v === '' ? null : v);

  try {
    const id = await queryInsert(
      `INSERT INTO content_staging
         (user_id, content_type, lang, title_fa, title_en, content_fa, content_en,
          excerpt_fa, excerpt_en, youtube_url, podcast_url, embed_provider,
          featured_media, categories, status, scheduled_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId,
        content_type,
        lang,
        n(title_fa),
        n(title_en),
        n(content_fa),
        n(content_en),
        n(excerpt_fa),
        n(excerpt_en),
        n(youtube_url),
        n(podcast_url),
        n(embed_provider),
        n(featured_media),
        categories ? JSON.stringify(categories) : null,
        status,
        n(scheduled_at),
      ]
    );

    await dbLog('info', 'content', 'Content created', { userId, id });
    return res.status(201).json({ id, message: 'محتوا ذخیره شد' });
  } catch (err: any) {
    console.error('❌ createContent error:', err.message, err.stack);
    await dbLog('error', 'content', 'createContent failed', { error: err.message, userId });
    return res.status(500).json({ error: 'خطا در ذخیره: ' + err.message });
  }
}

export async function updateContent(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const role   = (req as any).user.role;
  const { id } = req.params;

  const existing = await queryOne<{ user_id: number; status: string }>(
    'SELECT user_id, status FROM content_staging WHERE id=?', [id]
  );
  if (!existing) return res.status(404).json({ error: 'محتوا یافت نشد' });
  if (role !== 'admin' && existing.user_id !== userId) {
    return res.status(403).json({ error: 'دسترسی ندارید' });
  }

  const fields = ['title_fa','title_en','content_fa','content_en','excerpt_fa',
                  'excerpt_en','youtube_url','podcast_url','embed_provider',
                  'featured_media','lang','content_type','scheduled_at'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const v = req.body[f];
      params.push(v === '' ? null : v);
      updates.push(`${f}=?`);
    }
  }
  if (req.body.categories !== undefined) {
    params.push(JSON.stringify(req.body.categories));
    updates.push('categories=?');
  }
  if (!updates.length) return res.status(400).json({ error: 'هیچ فیلدی برای بروزرسانی ارسال نشده' });

  params.push(id);
  await query(`UPDATE content_staging SET ${updates.join(',')}, updated_at=NOW() WHERE id=?`, params);
  return res.json({ message: 'بروزرسانی شد' });
}

export async function submitForReview(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { id } = req.params;
  const row = await queryOne<{ user_id: number; status: string }>(
    'SELECT user_id, status FROM content_staging WHERE id=?', [id]
  );
  if (!row) return res.status(404).json({ error: 'محتوا یافت نشد' });
  if (row.user_id !== userId) return res.status(403).json({ error: 'دسترسی ندارید' });
  if (row.status !== 'draft' && row.status !== 'rejected') {
    return res.status(400).json({ error: `محتوا در وضعیت "${row.status}" است و قابل ارسال نیست` });
  }

  await query("UPDATE content_staging SET status='pending', updated_at=NOW() WHERE id=?", [id]);
  await dbLog('info', 'content', 'Submitted for review', { userId, contentId: id });
  return res.json({ message: 'محتوا برای بررسی ارسال شد' });
}

export async function approveContent(req: Request, res: Response) {
  const adminId = (req as any).user.userId;
  const { id } = req.params;

  const row = await queryOne<any>('SELECT * FROM content_staging WHERE id=?', [id]);
  if (!row) return res.status(404).json({ error: 'محتوا یافت نشد' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'محتوا در وضعیت pending نیست' });

  try {
    const cats = row.categories
      ? (typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories)
      : [];

    // Categories and featured media are shared across translations
    const shared: Record<string, any> = { status: 'publish' };
    if (cats.length)        shared.categories     = cats;
    if (row.featured_media) shared.featured_media = row.featured_media;

    const lang = (row.lang || 'fa') as 'fa' | 'en' | 'both';

    let faPost: any = null;
    let enPost: any = null;

    // Persian version
    if ((lang === 'fa' || lang === 'both') && row.title_fa && row.content_fa) {
      faPost = await createPost({
        ...shared,
        title:     row.title_fa,
        content:   row.content_fa,
        excerpt:   row.excerpt_fa || undefined,
        raha_lang: 'fa',
      });
    }

    // English version
    if ((lang === 'en' || lang === 'both') && row.title_en && row.content_en) {
      enPost = await createPost({
        ...shared,
        title:     row.title_en,
        content:   row.content_en,
        excerpt:   row.excerpt_en || undefined,
        raha_lang: 'en',
      });
    }

    // Fallback: if 'both' was requested but only one side has content, accept what we have
    if (!faPost && !enPost) {
      const fallbackTitle   = row.title_fa   || row.title_en;
      const fallbackContent = row.content_fa || row.content_en;
      if (!fallbackTitle || !fallbackContent) {
        return res.status(400).json({ error: 'عنوان و محتوا الزامی است' });
      }
      const fallbackLang = row.title_fa ? 'fa' : 'en';
      const single = await createPost({
        ...shared,
        title:     fallbackTitle,
        content:   fallbackContent,
        raha_lang: fallbackLang,
      });
      if (fallbackLang === 'fa') faPost = single; else enPost = single;
    }

    // Link translations if both languages got published
    let groupId: string | null = null;
    if (faPost && enPost) {
      try {
        const link = await rahaLinkTranslation({ fa: faPost.id, en: enPost.id });
        groupId = link.group_id;
      } catch (linkErr: any) {
        await dbLog('warn', 'content', 'Translation link failed (posts still published)', {
          error: linkErr.message, faId: faPost.id, enId: enPost.id,
        });
      }
    }

    // Primary post for backward-compat reference in content_staging.wp_post_id
    const primary = faPost || enPost;

    await query(
      `UPDATE content_staging SET status='published', wp_post_id=?,
       approved_by=?, approved_at=NOW(), published_at=NOW() WHERE id=?`,
      [primary.id, adminId, id]
    );

    await dbLog('info', 'content', 'Content approved & published', {
      adminId, contentId: id, lang,
      faId: faPost?.id, enId: enPost?.id, groupId,
    });

    return res.json({
      message:  groupId ? 'منتشر شد (دوزبانه)' : 'منتشر شد',
      wpPostId: primary.id,
      wpLink:   primary.link,
      fa:       faPost ? { id: faPost.id, link: faPost.link } : null,
      en:       enPost ? { id: enPost.id, link: enPost.link } : null,
      groupId,
    });
  } catch (err: any) {
    await dbLog('error', 'content', 'WP publish failed', { error: err.message });
    return res.status(500).json({ error: 'خطا در انتشار وردپرس: ' + err.message });
  }
}

export async function rejectContent(req: Request, res: Response) {
  const adminId = (req as any).user.userId;
  const { id } = req.params;
  const { note } = req.body;

  await query(
    "UPDATE content_staging SET status='rejected', approval_note=?, approved_by=?, approved_at=NOW() WHERE id=?",
    [note || '', adminId, id]
  );
  await dbLog('info', 'content', 'Content rejected', { adminId, contentId: id });
  return res.json({ message: 'رد شد' });
}

export async function deleteContent(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const role   = (req as any).user.role;
  const { id } = req.params;

  const row = await queryOne<{ user_id: number; wp_post_id: number | null }>(
    'SELECT user_id, wp_post_id FROM content_staging WHERE id=?', [id]
  );
  if (!row) return res.status(404).json({ error: 'یافت نشد' });
  if (role !== 'admin' && row.user_id !== userId) return res.status(403).json({ error: 'دسترسی ندارید' });

  if (row.wp_post_id) {
    try { await deletePost(row.wp_post_id); } catch { /* best effort */ }
  }
  await query('DELETE FROM content_staging WHERE id=?', [id]);
  return res.json({ message: 'حذف شد' });
}
