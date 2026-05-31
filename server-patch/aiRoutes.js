'use strict';

const express     = require('express');
const router      = express.Router();
const aiRouter    = require('../services/ai/AIRouter');
const KeyManager  = require('../services/ai/KeyManager');
const UserService = require('../services/UserService');
const { authMiddleware, requirePermission, requireRole } = require('../middleware/auth');
const config      = require('../config');
const axios       = require('axios');

router.use(authMiddleware);

const DEFAULT_PROVIDER = process.env.AI_DEFAULT_PROVIDER || (config.ai && config.ai.defaultProvider) || 'gemini';

// ─────────────────────────────────────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    res.json({
      enabled:            aiRouter.isAIEnabled(),
      availableProviders: aiRouter.getAvailableProviders(),
      capabilities:       config.ai.capabilities,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /ai/keys
router.get('/keys', async (req, res) => {
  try {
    const userId  = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const rows    = await KeyManager.listUserKeys(userId, isAdmin);
    const BUILTIN = ['gemini', 'openai', 'claude', 'deepseek', 'grok', 'mistral'];

    const builtIn = BUILTIN.map(p => ({
      provider:     p,
      nickname:     '',
      hasKey:       rows.some(r => r.provider === p && r.nickname === '' && r.is_global === 0),
      hasGlobalKey: rows.some(r => r.provider === p && r.is_global === 1),
    }));

    const custom = rows
      .filter(r => r.provider === 'custom')
      .map(r => ({
        provider:    'custom',
        nickname:    r.nickname,
        displayName: r.display_name,
        customUrl:   r.custom_url,
        customModel: r.custom_model,
        isGlobal:    r.is_global === 1,
      }));

    res.json({ builtIn, custom, customUsed: custom.length, customLimit: isAdmin ? 10 : 2 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /ai/keys
router.post('/keys', async (req, res) => {
  try {
    const userId  = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { provider, apiKey, nickname = '', displayName, customUrl, customModel, isGlobal = false } = req.body;

    if (!apiKey || !apiKey.trim()) return res.status(400).json({ error: 'کلید API الزامی است' });
    if (!provider)                  return res.status(400).json({ error: 'provider الزامی است' });
    if (isGlobal && !isAdmin)       return res.status(403).json({ error: 'فقط ادمین می‌تواند کلید global تنظیم کند' });
    if (provider === 'custom' && (!customUrl || !customModel || !nickname))
      return res.status(400).json({ error: 'برای پروایدر سفارشی، نام، URL و مدل الزامی است' });

    await KeyManager.saveKey({
      userId:      (isAdmin && isGlobal) ? null : userId,
      provider,
      nickname:    provider === 'custom' ? nickname.trim() : '',
      displayName: displayName ? displayName.trim() : null,
      apiKey,
      customUrl:   customUrl  ? customUrl.trim()   : null,
      customModel: customModel ? customModel.trim() : null,
      isGlobal:    isAdmin && isGlobal,
    });

    // Immediately update process.env for global Gemini key
    if (isAdmin && isGlobal && provider === 'gemini') {
      process.env.GEMINI_API_KEY = apiKey.trim();
    }

    res.json({ success: true, message: `کلید ${displayName || provider} ذخیره شد` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /ai/keys/:provider
router.delete('/keys/:provider', async (req, res) => {
  try {
    const userId   = req.user.id;
    const isAdmin  = req.user.role === 'admin';
    const provider = req.params.provider;
    const nickname = req.query.nickname || '';
    const isGlobal = req.query.global === '1' && isAdmin;

    if (isGlobal) {
      await KeyManager.deleteGlobalKey({ provider, nickname });
    } else {
      await KeyManager.deleteKey({ userId, provider, nickname });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /ai/test
router.post('/test', async (req, res) => {
  try {
    const userId   = req.user.id;
    const { provider, nickname = '' } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider الزامی است' });

    const stored = await KeyManager.getKeyForRequest(userId, provider, nickname);
    if (!stored || !stored.key) return res.status(200).json({ ok: false, error: 'کلید ذخیره‌شده‌ای یافت نشد' });

    const TEST_PROMPT = 'Reply with exactly: OK';
    let result = '';

    if (provider === 'gemini') {
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${stored.key}`,
        { contents: [{ parts: [{ text: TEST_PROMPT }] }] },
        { timeout: 15000 }
      );
      result = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';
    } else if (provider === 'claude') {
      const { data } = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-haiku-4-5-20251001', max_tokens: 10, messages: [{ role: 'user', content: TEST_PROMPT }] },
        { headers: { 'x-api-key': stored.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      result = data && data.content && data.content[0] ? data.content[0].text : '';
    } else {
      const URLS = {
        openai:   'https://api.openai.com/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions',
        grok:     'https://api.x.ai/v1/chat/completions',
        mistral:  'https://api.mistral.ai/v1/chat/completions',
        custom:   stored.customUrl,
      };
      const MODELS = { openai: 'gpt-4o-mini', deepseek: 'deepseek-chat', grok: 'grok-3-mini', mistral: 'mistral-small-latest', custom: stored.customModel };
      const url = URLS[provider];
      if (!url) return res.status(200).json({ ok: false, error: 'provider ناشناخته' });
      const { data } = await axios.post(
        url,
        { model: MODELS[provider], messages: [{ role: 'user', content: TEST_PROMPT }], max_tokens: 10 },
        { headers: { Authorization: `Bearer ${stored.key}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      result = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    }

    res.json({ ok: true, message: 'اتصال موفق بود', sample: String(result).slice(0, 100), usedPersonalKey: stored.isPersonal });
  } catch (err) {
    res.status(200).json({ ok: false, error: (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI GENERATION
// ─────────────────────────────────────────────────────────────────────────────

async function callWithKey(userId, provider, promptText, customUrl, customModel) {
  const stored   = await KeyManager.getKeyForRequest(userId, provider);
  // Fallback chain: DB key → env var from config → direct env var
  const provCfg  = config.ai.providers && config.ai.providers[provider];
  const envKey   = provCfg && provCfg.apiKeyEnv ? process.env[provCfg.apiKeyEnv] : (process.env[(provider.toUpperCase() + '_API_KEY')]);
  const apiKey   = (stored && stored.key) || envKey || '';
  const finalUrl = (stored && stored.customUrl) || customUrl;
  const finalMod = (stored && stored.customModel) || customModel;

  if (!apiKey) throw new Error(`کلیدی برای ${provider} یافت نشد. در تنظیمات کلید API اضافه کنید.`);

  if (provider === 'gemini') {
    const model = (config.ai.providers.gemini && config.ai.providers.gemini.model) || 'gemini-2.0-flash';
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: promptText }] }], generationConfig: { maxOutputTokens: 2048, temperature: 0.7 } },
      { timeout: 30000 }
    );
    return (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
  }
  if (provider === 'claude') {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-6', max_tokens: 2048, messages: [{ role: 'user', content: promptText }] },
      { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    return (data && data.content && data.content[0] && data.content[0].text) || '';
  }
  const URLS   = { openai: 'https://api.openai.com/v1/chat/completions', deepseek: 'https://api.deepseek.com/v1/chat/completions', grok: 'https://api.x.ai/v1/chat/completions', mistral: 'https://api.mistral.ai/v1/chat/completions', custom: finalUrl };
  const MODELS = { openai: 'gpt-4o', deepseek: 'deepseek-chat', grok: 'grok-3-mini', mistral: 'mistral-small-latest', custom: finalMod };
  const url = URLS[provider] || finalUrl;
  if (!url) throw new Error('URL پروایدر یافت نشد');
  const { data } = await axios.post(
    url,
    { model: MODELS[provider], messages: [{ role: 'user', content: promptText }], max_tokens: 2048, temperature: 0.7 },
    { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

router.post('/generate-title', authMiddleware, async (req, res) => {
  try {
    const { content, language = 'en', provider = DEFAULT_PROVIDER } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const p = language === 'fa' ? `برای این متن یک عنوان جذاب و کوتاه به فارسی بنویس:\n${content}` : `Write a catchy short title for:\n${content}`;
    const result = await callWithKey(req.user.id, provider, p);
    res.json({ success: true, result, provider });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/generate-content', authMiddleware, async (req, res) => {
  try {
    const { title, language = 'en', contentType = 'article', provider = DEFAULT_PROVIDER } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const p = language === 'fa' ? `یک ${contentType} کامل و باکیفیت به فارسی درباره «${title}» بنویس.` : `Write a complete high-quality ${contentType} about: ${title}`;
    const result = await callWithKey(req.user.id, provider, p);
    res.json({ success: true, result, provider });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/summarize', authMiddleware, async (req, res) => {
  try {
    const { content, language = 'en', provider = DEFAULT_PROVIDER } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const p = language === 'fa' ? `این متن را به فارسی خلاصه کن:\n${content}` : `Summarize:\n${content}`;
    const result = await callWithKey(req.user.id, provider, p);
    res.json({ success: true, result, provider });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/translate', authMiddleware, async (req, res) => {
  try {
    const { content, fromLanguage = 'en', toLanguage = 'fa', provider = DEFAULT_PROVIDER } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    const result = await callWithKey(req.user.id, provider, `Translate from ${fromLanguage} to ${toLanguage}:\n${content}`);
    res.json({ success: true, result, provider });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Generic generate (used by YouTube recommendations)
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, content, provider = DEFAULT_PROVIDER } = req.body;
    const text = prompt || content;
    if (!text || !text.trim()) return res.status(400).json({ error: 'متن ورودی الزامی است' });
    const result = await callWithKey(req.user.id, provider, text);
    res.json({ success: true, result, provider });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/openrouter-models', async (req, res) => {
  try {
    const { data } = await axios.get('https://openrouter.ai/api/v1/models', { timeout: 15000 });
    res.json({ models: (data && data.data ? data.data : []).map(m => ({ id: m.id, name: m.name || m.id, description: (m.description || '').slice(0, 200) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', requireRole('admin'), async (req, res) => {
  try {
    const stats = await aiRouter.getUsageStats();
    res.json({ stats, timestamp: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats/my', async (req, res) => {
  try {
    const stats = await aiRouter.getUsageStats(req.user.id);
    res.json({ stats, timestamp: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
