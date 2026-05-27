import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import { login, getMe, refreshTokens, logout, loginWithTelegram } from '../auth/authController';
import { generate, postJob, pollJob, saveUserKey, getUserKeys, deleteUserKey, quota, testUserKey, listOpenRouterModels } from '../ai/aiController';
import {
  listContent, getContent, createContent, updateContent,
  submitForReview, approveContent, rejectContent, deleteContent,
} from '../content/contentController';
import {
  getPosts, getCategories, uploadMedia, getMedia, updatePost, deletePost, wpRequest,
  getComments, updateComment, deleteComment, createComment,
} from '../wp/wpProxy';
import { handleWebhook } from '../bot/telegramBot';
import {
  listChannels, addChannel, updateChannel, deleteChannel,
  listQueue, approveVideo, rejectVideo,
  listPlaylists, importPlaylist,
  getAnalytics, runSync, getSettings, saveSettings,
  getAdvancedAnalytics, getAnalyticsTrends, getAnalyticsBestTimes,
  getAnalyticsReport, triggerAnalyticsSnapshot, reclassifyQueue,
} from '../youtube/ytController';
import { query } from '../db/pool';
import {
  getLevels, getPlans, checkPostAccess, getMySubscription, getAccessToken,
  startPayment, adminListSubscriptions, adminGrantSubscription,
  adminCancelSubscription, adminGetStats, adminSetPostLevel,
  adminRunExpire, adminGetTransactions,
} from '../membership/membershipController';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Telegram bot webhook (no auth — secret comes via URL path) ───────────────
router.post('/telegram/webhook', handleWebhook);

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/auth/login',    login);
router.post('/auth/telegram', loginWithTelegram);
router.post('/auth/refresh',  refreshTokens);
router.post('/auth/logout',   authMiddleware, logout);
router.get('/auth/me',        authMiddleware, getMe);

// ── AI (sync) ──────────────────────────────────────────────────────────────────
router.post('/ai/generate',         authMiddleware, generate);
router.get('/ai/quota',             authMiddleware, quota);
router.get('/ai/keys',              authMiddleware, getUserKeys);
router.post('/ai/keys',             authMiddleware, saveUserKey);
router.delete('/ai/keys/:provider', authMiddleware, deleteUserKey);
router.post('/ai/test',             authMiddleware, testUserKey);
router.get('/ai/openrouter-models', authMiddleware, listOpenRouterModels);

// ── AI (async job queue) ──────────────────────────────────────────────────────
router.post('/ai/job',      authMiddleware, postJob);
router.get('/ai/job/:id',   authMiddleware, pollJob);

// ── Content ───────────────────────────────────────────────────────────────────
router.get('/content',              authMiddleware, listContent);
router.get('/content/:id',          authMiddleware, getContent);
router.post('/content',             authMiddleware, createContent);
router.put('/content/:id',          authMiddleware, updateContent);
router.post('/content/:id/submit',  authMiddleware, submitForReview);
router.post('/content/:id/approve', authMiddleware, requireAdmin, approveContent);
router.post('/content/:id/reject',  authMiddleware, requireAdmin, rejectContent);
router.delete('/content/:id',       authMiddleware, deleteContent);

// ── WordPress Proxy ───────────────────────────────────────────────────────────
router.get('/wp/posts', authMiddleware, async (req: Request, res: Response) => {
  try { res.json(await getPosts(req.query as any)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/wp/posts/:id', authMiddleware, async (req: Request, res: Response) => {
  try { res.json(await wpRequest('GET', `/posts/${req.params.id}`)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/wp/posts/:id', authMiddleware, async (req: Request, res: Response) => {
  try { res.json(await updatePost(parseInt(req.params.id), req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/wp/posts/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await deletePost(parseInt(req.params.id))); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/wp/categories', authMiddleware, async (_req: Request, res: Response) => {
  try { res.json(await getCategories()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/wp/categories', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await wpRequest('POST', '/categories', req.body)); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.put('/wp/categories/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await wpRequest('POST', `/categories/${req.params.id}`, req.body)); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.delete('/wp/categories/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await wpRequest('DELETE', `/categories/${req.params.id}`, null, { force: true })); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

// ── Comments ──────────────────────────────────────────────────────────────────
router.get('/wp/comments', authMiddleware, async (req: Request, res: Response) => {
  try { res.json(await getComments(req.query as any)); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.put('/wp/comments/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await updateComment(parseInt(req.params.id), req.body)); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.delete('/wp/comments/:id', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try { res.json(await deleteComment(parseInt(req.params.id), req.query.force === 'true')); }
  catch (e: any) { res.status(500).json({ error: e.response?.data?.message || e.message }); }
});

router.post('/wp/comments/:id/reply', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  try {
    const parent = parseInt(req.params.id);
    const parentComment = await wpRequest('GET', `/comments/${parent}`);
    const reply = await createComment({
      post:    parentComment.post,
      parent,
      content: req.body.content,
      status:  'approved',
    });
    res.json(reply);
  } catch (e: any) {
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

router.get('/wp/media', authMiddleware, async (req: Request, res: Response) => {
  try { res.json(await getMedia(req.query as any)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/wp/media', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'فایلی انتخاب نشده' });
  try {
    let { buffer, originalname: filename, mimetype: mimeType } = req.file;

    const convertible = ['image/jpeg', 'image/png', 'image/bmp', 'image/tiff'];
    if (convertible.includes(mimeType)) {
      buffer   = await sharp(buffer).webp({ quality: 82 }).toBuffer();
      filename = filename.replace(/\.[^.]+$/, '.webp');
      mimeType = 'image/webp';
    }

    const result = await uploadMedia(buffer, filename, mimeType);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Users (Admin) ─────────────────────────────────────────────────────────────
router.get('/users', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const rows = await query('SELECT id, username, display_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC');
  res.json(rows);
});

router.patch('/users/:id/role', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const { role } = req.body;
  if (!['admin', 'editor'].includes(role)) return res.status(400).json({ error: 'نقش نامعتبر' });
  await query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
  res.json({ message: 'نقش بروزرسانی شد' });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  const userId  = (req as any).user.userId as number;
  const isAdmin = (req as any).user.role === 'admin';

  const [pending, approved, total, aiUsage] = await Promise.all([
    isAdmin
      ? query("SELECT COUNT(*) as c FROM content_staging WHERE status='pending'")
      : query("SELECT COUNT(*) as c FROM content_staging WHERE status='pending' AND user_id=?", [userId]),
    isAdmin
      ? query("SELECT COUNT(*) as c FROM content_staging WHERE status='published'")
      : query("SELECT COUNT(*) as c FROM content_staging WHERE status='published' AND user_id=?", [userId]),
    isAdmin
      ? query('SELECT COUNT(*) as c FROM content_staging')
      : query('SELECT COUNT(*) as c FROM content_staging WHERE user_id=?', [userId]),
    query('SELECT COUNT(*) as c FROM ai_usage WHERE user_id=? AND DATE(used_at)=CURDATE()', [userId]),
  ]);

  res.json({
    pending:  parseInt(String(pending[0]?.c  || '0')),
    approved: parseInt(String(approved[0]?.c || '0')),
    total:    parseInt(String(total[0]?.c    || '0')),
    aiToday:  parseInt(String(aiUsage[0]?.c  || '0')),
  });
});

// ── Monitoring ────────────────────────────────────────────────────────────────
router.get('/monitoring/logs', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const limitVal = Math.min(parseInt(req.query.limit as string || '50'), 200);
  const level    = req.query.level as string | undefined;
  const params: any[] = [];
  let sql = 'SELECT * FROM system_logs WHERE 1=1';
  if (level) { params.push(level); sql += ' AND level = ?'; }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limitVal);
  const rows = await query(sql, params);
  res.json(rows);
});

router.get('/monitoring/ai-stats', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const rows = await query(`
    SELECT provider,
           COUNT(*) as requests,
           SUM(CASE WHEN used_own_key=1 THEN 1 ELSE 0 END) as own_key_count,
           DATE(used_at) as date
    FROM ai_usage
    WHERE used_at > NOW() - INTERVAL 7 DAY
    GROUP BY provider, DATE(used_at)
    ORDER BY date DESC
  `);
  res.json(rows);
});

// ── YouTube Manager ───────────────────────────────────────────────────────────
router.get   ('/youtube/channels',                   authMiddleware, requireAdmin, listChannels);
router.post  ('/youtube/channels',                   authMiddleware, requireAdmin, addChannel);
router.patch ('/youtube/channels/:id',               authMiddleware, requireAdmin, updateChannel);
router.delete('/youtube/channels/:id',               authMiddleware, requireAdmin, deleteChannel);
router.get   ('/youtube/queue',                      authMiddleware, requireAdmin, listQueue);
router.post  ('/youtube/queue/:id/approve',          authMiddleware, requireAdmin, approveVideo);
router.post  ('/youtube/queue/:id/reject',           authMiddleware, requireAdmin, rejectVideo);
router.get   ('/youtube/channels/:id/playlists',     authMiddleware, requireAdmin, listPlaylists);
router.post  ('/youtube/playlists/:pl_id/import',    authMiddleware, requireAdmin, importPlaylist);
router.get   ('/youtube/analytics',                  authMiddleware, requireAdmin, getAnalytics);
router.get   ('/youtube/analytics/advanced',         authMiddleware, requireAdmin, getAdvancedAnalytics);
router.get   ('/youtube/analytics/trends',           authMiddleware, requireAdmin, getAnalyticsTrends);
router.get   ('/youtube/analytics/best-times',       authMiddleware, requireAdmin, getAnalyticsBestTimes);
router.get   ('/youtube/analytics/report',           authMiddleware, requireAdmin, getAnalyticsReport);
router.post  ('/youtube/analytics/snapshot',         authMiddleware, requireAdmin, triggerAnalyticsSnapshot);
router.post  ('/youtube/sync',                       authMiddleware, requireAdmin, runSync);
router.post  ('/youtube/queue/reclassify',           authMiddleware, requireAdmin, reclassifyQueue);
router.get   ('/youtube/settings',                   authMiddleware, requireAdmin, getSettings);
router.patch ('/youtube/settings',                   authMiddleware, requireAdmin, saveSettings);

// ── Membership ────────────────────────────────────────────────────────────────
router.get   ('/membership/levels',                       getLevels);
router.get   ('/membership/plans',                        getPlans);
router.get   ('/membership/check/:post_id',               checkPostAccess);
router.get   ('/membership/my',                           authMiddleware, getMySubscription);
router.post  ('/membership/token',                        authMiddleware, getAccessToken);
router.post  ('/membership/pay/start',                    authMiddleware, startPayment);
router.get   ('/membership/admin/subscriptions',          authMiddleware, requireAdmin, adminListSubscriptions);
router.post  ('/membership/admin/grant',                  authMiddleware, requireAdmin, adminGrantSubscription);
router.post  ('/membership/admin/cancel/:user_id',        authMiddleware, requireAdmin, adminCancelSubscription);
router.get   ('/membership/admin/stats',                  authMiddleware, requireAdmin, adminGetStats);
router.patch ('/membership/admin/post/:post_id/level',    authMiddleware, requireAdmin, adminSetPostLevel);
router.post  ('/membership/admin/expire',                 authMiddleware, requireAdmin, adminRunExpire);
router.get   ('/membership/admin/transactions',           authMiddleware, requireAdmin, adminGetTransactions);

export default router;
