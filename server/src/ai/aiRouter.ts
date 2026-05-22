import axios from 'axios';
import { query, queryOne } from '../db/pool';
import { config } from '../config';
import { decrypt } from './encryption';
import { dbLog } from '../monitoring/logger';

export type AIProvider = 'openai' | 'claude' | 'gemini' | 'deepseek' | 'grok' | 'mistral' | 'custom';
export const AI_PROVIDER_LIST: AIProvider[] = ['openai', 'claude', 'gemini', 'deepseek', 'grok', 'mistral', 'custom'];

const PROVIDER_CONFIG: Record<AIProvider, { url: string; model: string }> = {
  openai:   { url: 'https://api.openai.com/v1/chat/completions',             model: 'gpt-4o' },
  claude:   { url: 'https://api.anthropic.com/v1/messages',                  model: 'claude-sonnet-4-6' },
  gemini:   { url: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.5-flash' },
  deepseek: { url: 'https://api.deepseek.com/v1/chat/completions',           model: 'deepseek-chat' },
  grok:     { url: 'https://api.x.ai/v1/chat/completions',                   model: 'grok-3-mini' },
  mistral:  { url: 'https://api.mistral.ai/v1/chat/completions',             model: 'mistral-small-latest' },
  custom:   { url: '',                                                       model: '' },
};

async function callProvider(
  provider: AIProvider, apiKey: string, prompt: string,
  customUrl?: string | null, customModel?: string | null
): Promise<string> {
  const cfg = PROVIDER_CONFIG[provider];

  // Custom OpenAI-compatible provider
  if (provider === 'custom') {
    if (!customUrl || !customModel) throw new Error('URL یا مدل برای پروایدر سفارشی تنظیم نشده');
    const res = await axios.post(customUrl, {
      model: customModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.7,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    return res.data?.choices?.[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const url = `${cfg.url}/${cfg.model}:generateContent?key=${apiKey}`;
    const res = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }, { timeout: 30000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'claude') {
    const res = await axios.post(cfg.url, {
      model: cfg.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    return res.data?.content?.[0]?.text || '';
  }

  // OpenAI-compatible: openai, deepseek, grok, mistral
  const res = await axios.post(cfg.url, {
    model: cfg.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
    temperature: 0.7,
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  return res.data?.choices?.[0]?.message?.content || '';
}

async function getUserKey(userId: number, provider: AIProvider, nickname: string = ''):
  Promise<{ key: string; customUrl: string | null; customModel: string | null } | null>
{
  const row = await queryOne<{ api_key_enc: string; custom_url: string | null; custom_model: string | null }>(
    'SELECT api_key_enc, custom_url, custom_model FROM user_ai_keys WHERE user_id=? AND provider=? AND nickname=? AND is_active=1',
    [userId, provider, nickname]
  );
  if (!row) return null;
  try {
    return { key: decrypt(row.api_key_enc), customUrl: row.custom_url, customModel: row.custom_model };
  } catch { return null; }
}

async function checkQuota(userId: number): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM ai_usage WHERE user_id=? AND used_own_key=0 AND DATE(used_at)=?',
    [userId, today]
  );
  return parseInt(rows[0]?.count || '0') < config.ai.dailyQuota;
}

export async function runAI(
  userId: number,
  provider: AIProvider,
  prompt: string,
  action: string,
  nickname: string = ''
): Promise<{ result: string; usedOwnKey: boolean }> {
  const stored = await getUserKey(userId, provider, nickname);
  let apiKey      = stored?.key ?? null;
  let customUrl   = stored?.customUrl ?? null;
  let customModel = stored?.customModel ?? null;
  let usedOwnKey  = !!apiKey;

  if (!apiKey) {
    if (provider === 'custom') {
      throw new Error('برای پروایدر سفارشی باید کلید API و URL و مدل را خودتان وارد کنید.');
    }
    if (!(await checkQuota(userId))) {
      throw new Error(`سهمیه روزانه AI شما (${config.ai.dailyQuota} درخواست) تمام شده. کلید شخصی خود را در تنظیمات وارد کنید.`);
    }
    apiKey = (config.ai.masterKeys as any)[provider];
    if (!apiKey) throw new Error(`کلید master برای ${provider} تنظیم نشده`);
  }

  let result: string;
  try {
    result = await callProvider(provider, apiKey, prompt, customUrl, customModel);
  } catch (err: any) {
    await dbLog('error', 'ai', `${provider} call failed`, { error: err.message, userId });
    throw new Error(`خطای AI (${provider}): ${err.response?.data?.error?.message || err.message}`);
  }

  const modelUsed = provider === 'custom' ? (customModel || 'custom') : PROVIDER_CONFIG[provider].model;
  await query(
    'INSERT INTO ai_usage (user_id, provider, model, action, used_own_key) VALUES (?,?,?,?,?)',
    [userId, provider, modelUsed, action, usedOwnKey ? 1 : 0]
  );
  await dbLog('info', 'ai', `${provider} request success`, { userId, action, usedOwnKey });

  return { result, usedOwnKey };
}

export async function getQuotaStatus(userId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM ai_usage WHERE user_id=? AND used_own_key=0 AND DATE(used_at)=?',
    [userId, today]
  );
  const used = parseInt(rows[0]?.count || '0');
  return { used, total: config.ai.dailyQuota, remaining: config.ai.dailyQuota - used };
}
