import { Request, Response } from 'express';
import { runAI, getQuotaStatus, AIProvider, AI_PROVIDER_LIST } from './aiRouter';
import { enqueueJob, getJobStatus, queueNameForAction } from './jobQueue';
import { encrypt } from './encryption';
import { query } from '../db/pool';

// ── Synchronous generation (legacy, kept for backward compat) ─────────────────

export async function generate(req: Request, res: Response) {
  const userId                          = (req as any).user.userId;
  const { provider = 'gemini', action, prompt } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!prompt) return res.status(400).json({ error: 'متن ورودی الزامی است' });

  try {
    const { result, usedOwnKey } = await runAI(userId, provider, prompt, action || 'generate');
    const q = await getQuotaStatus(userId);
    return res.json({ result, provider, usedOwnKey, quota: q });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── Async job queue ───────────────────────────────────────────────────────────

export async function postJob(req: Request, res: Response) {
  const userId                          = (req as any).user.userId;
  const { provider = 'gemini', action, prompt } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!prompt?.trim()) return res.status(400).json({ error: 'متن ورودی الزامی است' });

  const queue = queueNameForAction(action || 'generate');
  const jobId = await enqueueJob({
    userId,
    provider:  provider as AIProvider,
    action:    action || 'generate',
    prompt:    prompt.trim(),
    queue,
  });

  return res.status(202).json({ jobId, status: 'pending', queue });
}

export async function pollJob(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const job    = await getJobStatus(req.params.id, userId);
  if (!job) return res.status(404).json({ error: 'کار یافت نشد' });
  return res.json(job);
}

// ── BYOK key management ───────────────────────────────────────────────────────

export async function saveUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { provider, apiKey, customUrl, customModel } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!apiKey?.trim()) return res.status(400).json({ error: 'کلید API الزامی است' });
  if (provider === 'custom') {
    if (!customUrl?.trim() || !customModel?.trim()) {
      return res.status(400).json({ error: 'برای پروایدر سفارشی، URL و مدل الزامی است' });
    }
  }

  const encrypted = encrypt(apiKey.trim());
  await query(
    `INSERT INTO user_ai_keys (user_id, provider, api_key_enc, custom_url, custom_model, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE api_key_enc=VALUES(api_key_enc), custom_url=VALUES(custom_url), custom_model=VALUES(custom_model), is_active=1`,
    [userId, provider, encrypted, customUrl?.trim() || null, customModel?.trim() || null]
  );
  return res.json({ success: true, message: `کلید ${provider} ذخیره شد` });
}

export async function testUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { provider } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }

  try {
    const { result, usedOwnKey } = await runAI(userId, provider as AIProvider, 'Reply with exactly: OK', 'test');
    return res.json({
      ok: true,
      usedOwnKey,
      sample: (result || '').slice(0, 200),
      message: 'اتصال موفق بود',
    });
  } catch (err: any) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}

export async function getUserKeys(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const rows   = await query<{ provider: string; is_active: number }>(
    'SELECT provider, is_active FROM user_ai_keys WHERE user_id=?',
    [userId]
  );
  const keys = AI_PROVIDER_LIST.map(p => ({
    provider: p,
    hasKey:   rows.some(r => r.provider === p && r.is_active === 1),
  }));
  return res.json(keys);
}

export async function deleteUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  await query(
    'UPDATE user_ai_keys SET is_active=0 WHERE user_id=? AND provider=?',
    [userId, req.params.provider]
  );
  return res.json({ success: true });
}

export async function quota(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const q      = await getQuotaStatus(userId);
  return res.json(q);
}
