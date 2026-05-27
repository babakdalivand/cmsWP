import { Request, Response, NextFunction } from 'express';
import { wpRequest } from '../wp/wpProxy';
import { query, queryOne } from '../db/pool';
import { dbLog } from '../monitoring/logger';

const MEM_BASE = '/pa-yt/v1/membership';

async function memApi(method: string, path: string, data?: any) {
  return wpRequest(method, path, data, undefined, '/pa-yt/v1/membership');
}

/* ── Public endpoints ─────────────────────────────────────────────── */

export async function getLevels(_req: Request, res: Response) {
  try { res.json(await wpRequest('GET', '/levels', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getPlans(_req: Request, res: Response) {
  try { res.json(await wpRequest('GET', '/plans', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function checkPostAccess(req: Request, res: Response) {
  try {
    const postId = req.params.post_id;
    const token  = req.headers['x-access-token'] as string | undefined;

    // Token-based access check (for Telegram Mini App)
    if (token) {
      const r = await wpRequest('POST', '/token/validate', { token }, undefined, MEM_BASE).catch(() => null);
      if (r?.valid) return res.json({ can_view: true, user_level: r.level });
    }

    res.json(await wpRequest('GET', `/check/${postId}`, undefined, undefined, MEM_BASE));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

/* ── Authenticated user endpoints ─────────────────────────────────── */

export async function getMySubscription(req: Request, res: Response) {
  try { res.json(await wpRequest('GET', '/my', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAccessToken(req: Request, res: Response) {
  try { res.json(await wpRequest('POST', '/token', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function startPayment(req: Request, res: Response) {
  try {
    const result = await wpRequest('POST', '/pay/start', req.body, undefined, MEM_BASE);
    await dbLog('info', 'membership', 'Payment started', { userId: (req as any).user.userId, ...req.body });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

/* ── Admin endpoints ──────────────────────────────────────────────── */

export async function adminListSubscriptions(req: Request, res: Response) {
  try {
    const { status, limit, offset } = req.query;
    const qs = new URLSearchParams({ ...(status ? { status: String(status) } : {}), limit: String(limit || 50), offset: String(offset || 0) });
    res.json(await wpRequest('GET', `/admin/subscriptions?${qs}`, undefined, undefined, MEM_BASE));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminGrantSubscription(req: Request, res: Response) {
  try {
    const result = await wpRequest('POST', '/admin/grant', req.body, undefined, MEM_BASE);
    await dbLog('info', 'membership', 'Subscription granted', { admin: (req as any).user.userId, ...req.body });
    res.status(201).json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminCancelSubscription(req: Request, res: Response) {
  try {
    await wpRequest('POST', `/admin/cancel/${req.params.user_id}`, req.body, undefined, MEM_BASE);
    await dbLog('info', 'membership', 'Subscription cancelled', { admin: (req as any).user.userId, userId: req.params.user_id });
    res.status(204).end();
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminGetStats(_req: Request, res: Response) {
  try { res.json(await wpRequest('GET', '/admin/stats', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminSetPostLevel(req: Request, res: Response) {
  try {
    res.json(await wpRequest('PATCH', `/admin/post/${req.params.post_id}/level`, req.body, undefined, MEM_BASE));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminRunExpire(_req: Request, res: Response) {
  try { res.json(await wpRequest('POST', '/admin/expire', undefined, undefined, MEM_BASE)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function adminGetTransactions(req: Request, res: Response) {
  try {
    const qs = new URLSearchParams({ limit: String(req.query.limit || 50), offset: String(req.query.offset || 0) });
    res.json(await wpRequest('GET', `/admin/transactions?${qs}`, undefined, undefined, MEM_BASE));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

/* ── Access guard middleware (for future protected routes) ─────────── */
export function requireMembership(level: 'basic' | 'premium' | 'vip') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    try {
      const sub = await wpRequest('GET', '/my', undefined, undefined, MEM_BASE).catch(() => null);
      const levelPriority = { free: 0, basic: 10, premium: 20, vip: 30 };
      const userPriority  = levelPriority[sub?.level as keyof typeof levelPriority] ?? 0;
      const reqPriority   = levelPriority[level];

      if (userPriority >= reqPriority) return next();
      return res.status(403).json({ error: 'Membership required', required: level, current: sub?.level ?? 'free' });
    } catch {
      return res.status(403).json({ error: 'Unable to verify membership' });
    }
  };
}
