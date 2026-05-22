import axios from 'axios';
import { Request, Response } from 'express';
import { runAI, getQuotaStatus, AIProvider, AI_PROVIDER_LIST } from './aiRouter';
import { enqueueJob, getJobStatus, queueNameForAction } from './jobQueue';
import { encrypt } from './encryption';
import { query } from '../db/pool';

// ── Synchronous generation (legacy, kept for backward compat) ─────────────────

export async function generate(req: Request, res: Response) {
  const userId                          = (req as any).user.userId;
  const { provider = 'gemini', nickname = '', action, prompt } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!prompt) return res.status(400).json({ error: 'متن ورودی الزامی است' });

  try {
    const { result, usedOwnKey } = await runAI(userId, provider, prompt, action || 'generate', nickname);
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

const CUSTOM_LIMIT = { admin: 5, editor: 2 } as const;

export async function saveUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const role   = (req as any).user.role || 'editor';
  const { provider, apiKey, customUrl, customModel, nickname, displayName } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!apiKey?.trim()) return res.status(400).json({ error: 'کلید API الزامی است' });

  const isCustom = provider === 'custom';
  if (isCustom && (!customUrl?.trim() || !customModel?.trim() || !nickname?.trim())) {
    return res.status(400).json({ error: 'برای پروایدر سفارشی، نام، URL و مدل الزامی است' });
  }

  const nick = isCustom ? nickname.trim() : '';

  if (isCustom) {
    // Check whether this exact nickname already exists for this user (we'd be updating it)
    const existing = await query<{ id: number }>(
      `SELECT id FROM user_ai_keys WHERE user_id=? AND provider='custom' AND nickname=? AND is_active=1`,
      [userId, nick]
    );
    if (existing.length === 0) {
      // New custom provider — enforce limit
      const countRows = await query<{ c: number }>(
        `SELECT COUNT(*) as c FROM user_ai_keys WHERE user_id=? AND provider='custom' AND is_active=1`,
        [userId]
      );
      const used  = parseInt(String(countRows[0]?.c || '0'));
      const limit = CUSTOM_LIMIT[role === 'admin' ? 'admin' : 'editor'];
      if (used >= limit) {
        return res.status(403).json({
          error: `سهمیه پروایدر سفارشی شما (${limit} پروایدر) تمام شده`,
        });
      }
    }
  }

  const encrypted = encrypt(apiKey.trim());
  await query(
    `INSERT INTO user_ai_keys (user_id, provider, nickname, display_name, api_key_enc, custom_url, custom_model, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       api_key_enc=VALUES(api_key_enc),
       display_name=VALUES(display_name),
       custom_url=VALUES(custom_url),
       custom_model=VALUES(custom_model),
       is_active=1`,
    [userId, provider, nick, displayName?.trim() || null, encrypted, customUrl?.trim() || null, customModel?.trim() || null]
  );
  return res.json({ success: true, message: `کلید ${displayName || provider} ذخیره شد` });
}

export async function testUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { provider, nickname = '' } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }

  try {
    const { result, usedOwnKey } = await runAI(userId, provider as AIProvider, 'Reply with exactly: OK', 'test', nickname);
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
  const role   = (req as any).user.role || 'editor';

  const rows = await query<{
    provider: string; nickname: string; display_name: string | null;
    custom_url: string | null; custom_model: string | null; is_active: number;
  }>(
    'SELECT provider, nickname, display_name, custom_url, custom_model, is_active FROM user_ai_keys WHERE user_id=? AND is_active=1 ORDER BY provider, nickname',
    [userId]
  );

  // Built-in providers: one entry each
  const builtIn = AI_PROVIDER_LIST.filter(p => p !== 'custom').map(p => ({
    provider: p,
    nickname: '',
    displayName: null as string | null,
    customUrl: null as string | null,
    customModel: null as string | null,
    hasKey: rows.some(r => r.provider === p && r.nickname === ''),
  }));

  // Custom providers: one entry per (provider='custom', nickname)
  const customKeys = rows
    .filter(r => r.provider === 'custom')
    .map(r => ({
      provider: 'custom' as const,
      nickname: r.nickname,
      displayName: r.display_name,
      customUrl: r.custom_url,
      customModel: r.custom_model,
      hasKey: true,
    }));

  const customLimit = CUSTOM_LIMIT[role === 'admin' ? 'admin' : 'editor'];

  return res.json({
    builtIn,
    custom:      customKeys,
    customUsed:  customKeys.length,
    customLimit,
  });
}

export async function deleteUserKey(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const provider = req.params.provider;
  const nickname = (req.query.nickname as string) || '';
  await query(
    'UPDATE user_ai_keys SET is_active=0 WHERE user_id=? AND provider=? AND nickname=?',
    [userId, provider, nickname]
  );
  return res.json({ success: true });
}

export async function listOpenRouterModels(_req: Request, res: Response) {
  try {
    const { data } = await axios.get('https://openrouter.ai/api/v1/models', { timeout: 15000 });
    const models = (data?.data || []).map((m: any) => ({
      id:          m.id,
      name:        m.name || m.id,
      description: m.description?.slice(0, 200) || '',
      contextLen:  m.context_length,
      pricing:     {
        prompt:     parseFloat(m.pricing?.prompt || '0'),
        completion: parseFloat(m.pricing?.completion || '0'),
      },
    }));
    return res.json({ models });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function quota(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const q      = await getQuotaStatus(userId);
  return res.json(q);
}
