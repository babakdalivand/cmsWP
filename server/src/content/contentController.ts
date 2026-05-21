import { Request, Response } from 'express';
import { query, queryOne, queryInsert } from '../db/pool';
import { createPost, updatePost, deletePost } from '../wp/wpProxy';
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

  const id = await queryInsert(
    `INSERT INTO content_staging
       (user_id, content_type, lang, title_fa, title_en, content_fa, content_en,
        excerpt_fa, excerpt_en, youtube_url, podcast_url, embed_provider,
        featured_media, categories, status, scheduled_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [userId, content_type, lang, title_fa, title_en, content_fa, content_en,
     excerpt_fa, excerpt_en, youtube_url, podcast_url, embed_provider,
     featured_media, categories ? JSON.stringify(categories) : null,
     status, scheduled_at || null]
  );

  await dbLog('info', 'content', 'Content created', { userId, id });
  return res.status(201).json({ id, message: 'محتوا ذخیره شد' });
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
      params.push(f === 'categories' ? JSON.stringify(req.body[f]) : req.body[f]);
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
    const wpData: Record<string, any> = {
      title:   row.title_fa || row.title_en,
      content: row.content_fa || row.content_en,
      status:  'publish',
    };
    if (cats.length)        wpData.categories     = cats;
    if (row.featured_media) wpData.featured_media = row.featured_media;

    const wpPost = await createPost(wpData);

    await query(
      `UPDATE content_staging SET status='published', wp_post_id=?,
       approved_by=?, approved_at=NOW(), published_at=NOW() WHERE id=?`,
      [wpPost.id, adminId, id]
    );

    await dbLog('info', 'content', 'Content approved & published', { adminId, contentId: id, wpPostId: wpPost.id });
    return res.json({ message: 'منتشر شد', wpPostId: wpPost.id, wpLink: wpPost.link });
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
