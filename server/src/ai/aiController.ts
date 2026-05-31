import axios from 'axios';
import { Request, Response } from 'express';
import { runAI, getQuotaStatus, runImageGeneration, AIProvider, AI_PROVIDER_LIST } from './aiRouter';
import { enqueueJob, getJobStatus, queueNameForAction } from './jobQueue';
import { encrypt, decrypt } from './encryption';
import { query, queryOne } from '../db/pool';

// ── Synchronous generation (legacy, kept for backward compat) ─────────────────

export async function generate(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  let { provider, nickname = '', action, prompt } = req.body;

  // Use DB-configured default provider if not specified
  if (!provider) {
    const row = await queryOne<{ config_value: string }>(
      "SELECT config_value FROM site_config WHERE config_key='ai_default_provider'", []
    );
    provider = row?.config_value || 'gemini';
  }

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

// ── Image generation (Gemini Imagen) ─────────────────────────────────────────

export async function generateImage(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { prompt, title, content_type } = req.body;

  const autoPrompt = [
    'A professional, modern, high-quality blog cover image.',
    'Clean, minimalist design, no text, no watermarks.',
    content_type === 'podcast'
      ? 'Podcast artwork style, dark background, microphone or sound waves motif.'
      : content_type === 'youtube'
      ? 'YouTube thumbnail style, bold and eye-catching.'
      : 'Editorial illustration style suitable for a humanist/atheist publication.',
    title ? `Topic: "${title}".` : '',
  ].filter(Boolean).join(' ');

  const finalPrompt = prompt?.trim() || autoPrompt;

  try {
    const result = await runImageGeneration(userId, finalPrompt);
    return res.json({ ...result, prompt: finalPrompt });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── BYOK key management ───────────────────────────────────────────────────────

const CUSTOM_LIMIT = { admin: 5, editor: 2 } as const;

export async function saveUserKey(req: Request, res: Response) {
  const userId  = (req as any).user.userId;
  const role    = (req as any).user.role || 'editor';
  const isAdmin = role === 'admin';
  const { provider, apiKey, customUrl, customModel, nickname, displayName, isGlobal = false } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!apiKey?.trim()) return res.status(400).json({ error: 'کلید API الزامی است' });
  if (isGlobal && !isAdmin) return res.status(403).json({ error: 'فقط ادمین می‌تواند کلید جهانی تنظیم کند' });

  const isCustom = provider === 'custom';
  if (isCustom && (!customUrl?.trim() || !customModel?.trim() || !nickname?.trim())) {
    return res.status(400).json({ error: 'برای پروایدر سفارشی، نام، URL و مدل الزامی است' });
  }

  const nick    = isCustom ? nickname.trim() : '';
  const ownerId = (isAdmin && isGlobal) ? null : userId;

  if (isCustom && !isGlobal) {
    const existing = await query<{ id: number }>(
      `SELECT id FROM user_ai_keys WHERE user_id=? AND provider='custom' AND nickname=? AND is_active=1`,
      [userId, nick]
    );
    if (existing.length === 0) {
      const countRows = await query<{ c: number }>(
        `SELECT COUNT(*) as c FROM user_ai_keys WHERE user_id=? AND provider='custom' AND is_active=1`,
        [userId]
      );
      const used  = parseInt(String(countRows[0]?.c || '0'));
      const limit = CUSTOM_LIMIT[isAdmin ? 'admin' : 'editor'];
      if (used >= limit) {
        return res.status(403).json({ error: `سهمیه پروایدر سفارشی شما (${limit} پروایدر) تمام شده` });
      }
    }
  }

  const encrypted = encrypt(apiKey.trim());

  if (isGlobal && isAdmin) {
    // Global keys: upsert by (provider, nickname, is_global=1, user_id IS NULL)
    await query(
      `INSERT INTO user_ai_keys (user_id, provider, nickname, display_name, api_key_enc, custom_url, custom_model, is_global, is_active)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         api_key_enc=VALUES(api_key_enc),
         display_name=VALUES(display_name),
         custom_url=VALUES(custom_url),
         custom_model=VALUES(custom_model),
         is_active=1`,
      [provider, nick, displayName?.trim() || null, encrypted, customUrl?.trim() || null, customModel?.trim() || null]
    );
  } else {
    await query(
      `INSERT INTO user_ai_keys (user_id, provider, nickname, display_name, api_key_enc, custom_url, custom_model, is_global, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
       ON DUPLICATE KEY UPDATE
         api_key_enc=VALUES(api_key_enc),
         display_name=VALUES(display_name),
         custom_url=VALUES(custom_url),
         custom_model=VALUES(custom_model),
         is_active=1`,
      [ownerId, provider, nick, displayName?.trim() || null, encrypted, customUrl?.trim() || null, customModel?.trim() || null]
    );
  }

  return res.json({ success: true, message: `کلید ${displayName || provider}${isGlobal ? ' (جهانی)' : ''} ذخیره شد` });
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
  const userId  = (req as any).user.userId;
  const role    = (req as any).user.role || 'editor';
  const isAdmin = role === 'admin';

  const [personalRows, globalRows] = await Promise.all([
    query<{ provider: string; nickname: string; display_name: string | null; custom_url: string | null; custom_model: string | null }>(
      'SELECT provider, nickname, display_name, custom_url, custom_model FROM user_ai_keys WHERE user_id=? AND is_active=1 ORDER BY provider, nickname',
      [userId]
    ),
    isAdmin
      ? query<{ provider: string; nickname: string; display_name: string | null; custom_url: string | null; custom_model: string | null }>(
          'SELECT provider, nickname, display_name, custom_url, custom_model FROM user_ai_keys WHERE user_id IS NULL AND is_global=1 AND is_active=1 ORDER BY provider, nickname',
          []
        )
      : Promise.resolve([]),
  ]);

  const builtIn = AI_PROVIDER_LIST.filter(p => p !== 'custom').map(p => ({
    provider:     p,
    hasKey:       personalRows.some(r => r.provider === p && r.nickname === ''),
    hasGlobalKey: globalRows.some(r => r.provider === p && r.nickname === ''),
  }));

  const customKeys = personalRows
    .filter(r => r.provider === 'custom')
    .map(r => ({
      provider:    'custom' as const,
      nickname:    r.nickname,
      displayName: r.display_name,
      customUrl:   r.custom_url,
      customModel: r.custom_model,
      isGlobal:    false,
    }));

  const customLimit = CUSTOM_LIMIT[isAdmin ? 'admin' : 'editor'];

  return res.json({
    builtIn,
    custom:      customKeys,
    customUsed:  customKeys.length,
    customLimit,
  });
}

export async function deleteUserKey(req: Request, res: Response) {
  const userId   = (req as any).user.userId;
  const isAdmin  = (req as any).user.role === 'admin';
  const provider = req.params.provider;
  const nickname = (req.query.nickname as string) || '';
  const isGlobal = req.query.global === '1' && isAdmin;

  if (isGlobal) {
    await query(
      'UPDATE user_ai_keys SET is_active=0 WHERE user_id IS NULL AND is_global=1 AND provider=? AND nickname=?',
      [provider, nickname]
    );
  } else {
    await query(
      'UPDATE user_ai_keys SET is_active=0 WHERE user_id=? AND provider=? AND nickname=?',
      [userId, provider, nickname]
    );
  }
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

// ── Admin: global AI config ───────────────────────────────────────────────────

export async function getAdminAIConfig(_req: Request, res: Response) {
  const [globalKeys, defaultRow] = await Promise.all([
    query<{ provider: string; display_name: string | null }>(
      `SELECT provider, display_name FROM user_ai_keys
       WHERE user_id IS NULL AND is_global=1 AND is_active=1
       ORDER BY provider`, []
    ),
    queryOne<{ config_value: string }>(
      "SELECT config_value FROM site_config WHERE config_key='ai_default_provider'", []
    ),
  ]);

  return res.json({
    globalKeys: globalKeys.map(k => ({
      provider:    k.provider,
      displayName: k.display_name,
      isDefault:   k.provider === defaultRow?.config_value,
    })),
    defaultProvider: defaultRow?.config_value || null,
  });
}

export async function setAdminAIConfig(req: Request, res: Response) {
  const { provider, apiKey, setAsDefault = true } = req.body;

  if (!AI_PROVIDER_LIST.includes(provider as AIProvider)) {
    return res.status(400).json({ error: 'پروایدر نامعتبر' });
  }
  if (!apiKey?.trim()) return res.status(400).json({ error: 'کلید API الزامی است' });

  const encrypted = encrypt(apiKey.trim());

  await query(
    `INSERT INTO user_ai_keys
       (user_id, provider, nickname, display_name, api_key_enc, is_global, is_active)
     VALUES (NULL, ?, '', ?, ?, 1, 1)
     ON DUPLICATE KEY UPDATE
       api_key_enc=VALUES(api_key_enc),
       display_name=VALUES(display_name),
       is_active=1`,
    [provider, provider, encrypted]
  );

  if (setAsDefault) {
    await query(
      `INSERT INTO site_config (config_key, config_value)
       VALUES ('ai_default_provider', ?)
       ON DUPLICATE KEY UPDATE config_value=VALUES(config_value), updated_at=NOW()`,
      [provider]
    );
  }

  return res.json({ success: true, message: `کلید ${provider} جهانی ذخیره شد` });
}

export async function deleteAdminAIConfig(req: Request, res: Response) {
  const { provider } = req.params;

  await query(
    'UPDATE user_ai_keys SET is_active=0 WHERE user_id IS NULL AND is_global=1 AND provider=?',
    [provider]
  );

  const defaultRow = await queryOne<{ config_value: string }>(
    "SELECT config_value FROM site_config WHERE config_key='ai_default_provider'", []
  );
  if (defaultRow?.config_value === provider) {
    await query("DELETE FROM site_config WHERE config_key='ai_default_provider'", []);
  }

  return res.json({ success: true });
}

export async function setDefaultProvider(req: Request, res: Response) {
  const { provider } = req.params;

  const exists = await queryOne(
    'SELECT id FROM user_ai_keys WHERE user_id IS NULL AND is_global=1 AND is_active=1 AND provider=?',
    [provider]
  );
  if (!exists) return res.status(404).json({ error: 'کلید جهانی برای این پروایدر وجود ندارد' });

  await query(
    `INSERT INTO site_config (config_key, config_value)
     VALUES ('ai_default_provider', ?)
     ON DUPLICATE KEY UPDATE config_value=VALUES(config_value), updated_at=NOW()`,
    [provider]
  );
  return res.json({ success: true });
}

export async function getAdminAIConfigForWP(req: Request, res: Response) {
  const syncToken = req.headers['x-wp-sync-token'];
  const { config } = await import('../config');
  if (!config.wpSyncToken || syncToken !== config.wpSyncToken) {
    return res.status(403).json({ error: 'توکن نامعتبر' });
  }

  const [globalKeys, defaultRow] = await Promise.all([
    query<{ provider: string; api_key_enc: string }>(
      `SELECT provider, api_key_enc FROM user_ai_keys
       WHERE user_id IS NULL AND is_global=1 AND is_active=1
       ORDER BY provider`, []
    ),
    queryOne<{ config_value: string }>(
      "SELECT config_value FROM site_config WHERE config_key='ai_default_provider'", []
    ),
  ]);

  const defaultProvider = defaultRow?.config_value || null;
  const defaultKey = globalKeys.find(k => k.provider === defaultProvider);

  return res.json({
    provider:    defaultProvider,
    apiKey:      defaultKey ? decrypt(defaultKey.api_key_enc) : null,
    allProviders: globalKeys.map(k => k.provider),
  });
}
