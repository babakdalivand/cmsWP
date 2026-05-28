import { useState, useEffect, useMemo } from 'react';
import { Key, Check, Trash2, Eye, EyeOff, TestTube2, Plus, X, Search, Globe, User } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface BuiltInProvider {
  id: string;
  name: string;
  icon: string;
  model: string;
}

const BUILT_IN: BuiltInProvider[] = [
  { id: 'gemini',   name: 'Google Gemini',  icon: '🧠', model: 'gemini-2.5-flash' },
  { id: 'openai',   name: 'OpenAI GPT-4o',  icon: '🤖', model: 'gpt-4o' },
  { id: 'claude',   name: 'Claude Sonnet',  icon: '✦',  model: 'claude-sonnet-4-6' },
  { id: 'deepseek', name: 'DeepSeek',       icon: '🔍', model: 'deepseek-chat' },
  { id: 'grok',     name: 'Grok (xAI)',     icon: '⚡', model: 'grok-3-mini' },
  { id: 'mistral',  name: 'Mistral AI',     icon: '🌬️', model: 'mistral-small-latest' },
];

interface Template {
  id: string;          // matches displayed name
  name: string;        // shown in dropdown
  icon: string;
  url: string;
  defaultModel?: string;
  hasModelPicker?: boolean;  // true for OpenRouter
  hint?: string;
}

const TEMPLATES: Template[] = [
  { id: 'openrouter', name: 'OpenRouter',  icon: '🌐', url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'anthropic/claude-sonnet-4-5', hasModelPicker: true,
    hint: 'دسترسی به ۳۰۰+ مدل از Anthropic, OpenAI, Google, Meta و ...' },
  { id: 'groq',       name: 'Groq',        icon: '⚡', url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    hint: 'سرعت inference بسیار بالا — رایگان برای مدل‌های open source' },
  { id: 'together',   name: 'Together AI', icon: '🤝', url: 'https://api.together.xyz/v1/chat/completions',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    hint: 'هاست مدل‌های open source' },
  { id: 'fireworks',  name: 'Fireworks AI', icon: '🎆', url: 'https://api.fireworks.ai/inference/v1/chat/completions',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    hint: 'inference سریع روی مدل‌های open source' },
  { id: 'ollama',     name: 'Ollama (Local)', icon: '🦙', url: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3.2',
    hint: 'سرور Ollama محلی — برای استفاده در شبکه داخلی' },
  { id: 'lmstudio',   name: 'LM Studio', icon: '🎬', url: 'http://localhost:1234/v1/chat/completions',
    defaultModel: 'local-model',
    hint: 'LM Studio محلی' },
  { id: 'custom',     name: '⚙️ آدرس سفارشی', icon: '⚙️', url: '',
    hint: 'هر API سازگار با OpenAI' },
];

interface CustomKey {
  provider: 'custom';
  nickname: string;
  displayName: string | null;
  customUrl: string | null;
  customModel: string | null;
  hasKey: boolean;
}

interface BuiltInKey {
  provider: string;
  nickname: string;
  hasKey: boolean;
  hasGlobalKey: boolean;
}

interface KeysResponse {
  builtIn: BuiltInKey[];
  custom: CustomKey[];
  customUsed: number;
  customLimit: number;
}

type TestResult = { ok: boolean; message?: string; error?: string; sample?: string };

export default function ApiSettings() {
  const isAdmin = useAuthStore(s => s.isAdmin());
  const [data, setData]       = useState<KeysResponse | null>(null);
  const [inputs, setInputs]   = useState<Record<string, string>>({});
  const [show, setShow]       = useState<Record<string, boolean>>({});
  const [globalMode, setGlobalMode] = useState<Record<string, boolean>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({});
  const [toast, setToast]     = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  function reloadKeys() {
    api.get('/ai/keys').then(r => setData(r.data));
  }

  useEffect(() => {
    reloadKeys();
  }, []);

  // ── Built-in provider key handling ──────────────────────────────────────────
  async function saveBuiltIn(p: BuiltInProvider) {
    const key = inputs[p.id]?.trim();
    if (!key) return;
    setSaving(p.id);
    const isGlobal = isAdmin && !!globalMode[p.id];
    try {
      await api.post('/ai/keys', { provider: p.id, apiKey: key, isGlobal });
      setInputs(i => ({ ...i, [p.id]: '' }));
      reloadKeys();
      showToast(`کلید ${p.name} ${isGlobal ? '(جهانی) ' : ''}ذخیره شد ✓`);
    } catch (e: any) {
      showToast(e.response?.data?.error || 'خطا');
    } finally { setSaving(null); }
  }

  async function deleteBuiltIn(providerId: string, isGlobal = false) {
    const params = isGlobal ? '?global=1' : '';
    await api.delete(`/ai/keys/${providerId}${params}`);
    setTestResult(t => { const c = { ...t }; delete c[isGlobal ? `${providerId}:global` : providerId]; return c; });
    reloadKeys();
    showToast('کلید حذف شد');
  }

  async function deleteCustom(nickname: string) {
    if (!confirm(`حذف پروایدر «${nickname}»؟`)) return;
    await api.delete(`/ai/keys/custom?nickname=${encodeURIComponent(nickname)}`);
    setTestResult(t => { const c = { ...t }; delete c[`custom:${nickname}`]; return c; });
    reloadKeys();
    showToast('پروایدر حذف شد');
  }

  // ── Test ────────────────────────────────────────────────────────────────────
  async function testKey(provider: string, nickname: string = '') {
    const tkey = nickname ? `${provider}:${nickname}` : provider;
    setTesting(tkey);
    setTestResult(t => ({ ...t, [tkey]: { ok: false, message: 'در حال تست...' } }));
    try {
      const { data } = await api.post('/ai/test', { provider, nickname });
      setTestResult(t => ({ ...t, [tkey]: data }));
    } catch (e: any) {
      setTestResult(t => ({ ...t, [tkey]: { ok: false, error: e.response?.data?.error || e.message } }));
    } finally { setTesting(null); }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  if (!data) {
    return <div className="p-4" dir="rtl"><div className="bg-surface border border-border rounded-xl h-20 animate-pulse" /></div>;
  }

  const customCanAdd = data.customUsed < data.customLimit;

  return (
    <div className="p-4 pb-28" dir="rtl">
      <h1 className="text-white font-bold text-xl mb-2">تنظیمات کلید AI</h1>
      <p className="text-label text-sm mb-6">با وارد کردن کلید شخصی، سهمیه روزانه شما مصرف نمی‌شود (BYOK)</p>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-surface border border-blue/30 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* ── Built-in providers ────────────────────────────────────────────── */}
      <h2 className="text-white font-semibold text-sm mb-3">پروایدرهای اصلی</h2>
      <div className="flex flex-col gap-3 mb-6">
        {BUILT_IN.map(p => {
          const builtKey   = data.builtIn.find(b => b.provider === p.id);
          const hasPersonal = !!builtKey?.hasKey;
          const hasGlobal   = !!builtKey?.hasGlobalKey;
          const has         = hasPersonal || hasGlobal;
          const result      = testResult[p.id];
          const resultGlobal = testResult[`${p.id}:global`];
          const isGlobalInput = isAdmin && !!globalMode[p.id];
          return (
            <div key={p.id} className={`bg-surface border rounded-xl p-4 transition-colors ${has ? 'border-blue/40' : 'border-border'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{p.icon}</span>
                  <div>
                    <div className="text-white font-medium text-sm">{p.name}</div>
                    <div className="text-label text-xs">{p.model}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasGlobal && (
                    <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs px-2 py-0.5 rounded-full">
                      <Globe size={10} /> جهانی
                    </div>
                  )}
                  {hasPersonal && (
                    <div className="flex items-center gap-1 text-success text-xs"><Check size={12} /> شخصی</div>
                  )}
                  {hasPersonal && (
                    <>
                      <button onClick={() => testKey(p.id)} disabled={testing === p.id}
                        className="text-blue hover:bg-blue/10 p-1.5 rounded-lg disabled:opacity-40" title="تست کلید شخصی">
                        <TestTube2 size={14} />
                      </button>
                      <button onClick={() => deleteBuiltIn(p.id, false)} className="text-danger/70 hover:text-danger p-1.5 rounded-lg hover:bg-danger/10">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  {isAdmin && hasGlobal && (
                    <>
                      <button onClick={() => testKey(p.id)} disabled={testing === p.id}
                        className="text-orange-400 hover:bg-orange-400/10 p-1.5 rounded-lg disabled:opacity-40" title="تست کلید جهانی">
                        <TestTube2 size={14} />
                      </button>
                      <button onClick={() => deleteBuiltIn(p.id, true)} className="text-orange-400/70 hover:text-orange-400 p-1.5 rounded-lg hover:bg-orange-400/10" title="حذف کلید جهانی">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Admin: show global key test result */}
              {isAdmin && hasGlobal && resultGlobal && (
                <TestResultBox testing={testing === `${p.id}:global`} result={resultGlobal} />
              )}

              {/* Input area for adding a key */}
              {(!hasPersonal || (isAdmin && !hasGlobal)) && (
                <div className="flex flex-col gap-2">
                  {/* Admin global toggle */}
                  {isAdmin && (
                    <div className="flex items-center gap-2 py-1">
                      <button
                        onClick={() => setGlobalMode(m => ({ ...m, [p.id]: !m[p.id] }))}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          isGlobalInput
                            ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                            : 'bg-bg border-border text-label hover:text-white'
                        }`}
                      >
                        {isGlobalInput ? <Globe size={12} /> : <User size={12} />}
                        {isGlobalInput ? 'کلید جهانی (همه کاربران)' : 'کلید شخصی'}
                      </button>
                    </div>
                  )}
                  {(!hasPersonal || (isAdmin && isGlobalInput && !hasGlobal)) && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={show[p.id] ? 'text' : 'password'}
                          value={inputs[p.id] || ''}
                          onChange={e => setInputs(i => ({ ...i, [p.id]: e.target.value }))}
                          placeholder={`کلید API ${p.name}`}
                          dir="ltr"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue pl-10"
                        />
                        <button onClick={() => setShow(s => ({ ...s, [p.id]: !s[p.id] }))}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-label">
                          {show[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={() => saveBuiltIn(p)}
                        disabled={saving === p.id || !inputs[p.id]}
                        className={`disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                          isGlobalInput ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue hover:bg-blue-hover'
                        }`}
                      >
                        {saving === p.id ? '...' : <><Key size={14} /> ذخیره</>}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {hasPersonal && result && (
                <TestResultBox testing={testing === p.id} result={result} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Custom providers ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-semibold text-sm">پروایدرهای سفارشی</h2>
        <span className="text-label text-xs">{data.customUsed} از {data.customLimit}</span>
      </div>

      <div className="flex flex-col gap-3 mb-3">
        {data.custom.map(c => {
          const tkey = `custom:${c.nickname}`;
          const result = testResult[tkey];
          return (
            <div key={c.nickname} className="bg-surface border border-blue/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">⚙️</span>
                  <div className="min-w-0">
                    <div className="text-white font-medium text-sm truncate">{c.displayName || c.nickname}</div>
                    <div className="text-label text-xs truncate" dir="ltr" title={c.customModel || ''}>{c.customModel}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => testKey('custom', c.nickname)} disabled={testing === tkey}
                    className="text-blue hover:bg-blue/10 p-1.5 rounded-lg disabled:opacity-40" title="تست اتصال">
                    <TestTube2 size={14} />
                  </button>
                  <button onClick={() => deleteCustom(c.nickname)} className="text-danger/70 hover:text-danger p-1.5 rounded-lg hover:bg-danger/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {c.customUrl && (
                <div className="text-label text-[10px] mt-1 truncate" dir="ltr" title={c.customUrl}>{c.customUrl}</div>
              )}
              {result && <TestResultBox testing={testing === tkey} result={result} />}
            </div>
          );
        })}
      </div>

      {customCanAdd ? (
        <button onClick={() => setShowAddModal(true)}
          className="w-full border-2 border-dashed border-border text-label hover:text-blue hover:border-blue/40 rounded-xl p-4 flex items-center justify-center gap-2 transition-colors">
          <Plus size={16} />
          <span className="text-sm font-medium">افزودن پروایدر سفارشی</span>
        </button>
      ) : (
        <div className="border border-border rounded-xl p-3 text-label text-xs text-center">
          سهمیه پروایدر سفارشی شما تکمیل است ({data.customLimit} از {data.customLimit})
        </div>
      )}

      {showAddModal && (
        <AddProviderModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            reloadKeys();
            showToast('پروایدر سفارشی اضافه شد ✓');
          }}
        />
      )}
    </div>
  );
}

function TestResultBox({ testing, result }: { testing: boolean; result: TestResult }) {
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-xs border ${
      testing ? 'bg-blue/5 border-blue/30 text-blue'
        : result.ok ? 'bg-success/5 border-success/30 text-success'
        : 'bg-danger/5 border-danger/30 text-danger'
    }`}>
      {testing ? (
        <span className="animate-pulse">⏳ {result.message}</span>
      ) : result.ok ? (
        <div>
          <div className="flex items-center gap-1 font-medium mb-1"><Check size={12} /> {result.message || 'اتصال موفق'}</div>
          {result.sample && <div className="text-success/80 mt-1">پاسخ مدل: <span dir="auto">{result.sample}</span></div>}
        </div>
      ) : (
        <div>
          <div className="font-medium mb-1">❌ خطا در اتصال</div>
          <div className="text-danger/80 break-words">{result.error}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Add Custom Provider Modal
// ─────────────────────────────────────────────────────────────────────────────

interface ORModel { id: string; name: string; description: string; contextLen: number; pricing: { prompt: number; completion: number } }

function AddProviderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [templateId, setTemplateId] = useState<string>('');
  const [nickname,   setNickname]   = useState('');
  const [url,        setUrl]        = useState('');
  const [model,      setModel]      = useState('');
  const [apiKey,     setApiKey]     = useState('');
  const [showKey,    setShowKey]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  // OpenRouter models
  const [orModels, setOrModels] = useState<ORModel[] | null>(null);
  const [orLoading, setOrLoading] = useState(false);
  const [orQuery, setOrQuery] = useState('');

  const template = TEMPLATES.find(t => t.id === templateId) || null;

  function selectTemplate(id: string) {
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setTemplateId(id);
    setUrl(t.url);
    setModel(t.defaultModel || '');
    setNickname(t.id === 'custom' ? '' : t.name);
    setError('');

    // Auto-load OpenRouter models when picked
    if (t.hasModelPicker && !orModels) {
      setOrLoading(true);
      api.get('/ai/openrouter-models')
        .then(r => setOrModels(r.data.models))
        .catch(() => setError('بارگذاری مدل‌های OpenRouter ناموفق بود'))
        .finally(() => setOrLoading(false));
    }
  }

  const filteredORModels = useMemo(() => {
    if (!orModels) return [];
    const q = orQuery.toLowerCase().trim();
    if (!q) return orModels.slice(0, 50);
    return orModels.filter(m =>
      m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [orModels, orQuery]);

  async function handleSave() {
    if (!nickname.trim() || !url.trim() || !model.trim() || !apiKey.trim()) {
      setError('همه فیلدها الزامی هستند');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/ai/keys', {
        provider:    'custom',
        nickname:    nickname.trim(),
        displayName: template?.id === 'custom' ? nickname.trim() : `${template?.icon || '⚙️'} ${nickname.trim()}`,
        apiKey:      apiKey.trim(),
        customUrl:   url.trim(),
        customModel: model.trim(),
      });
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error || 'خطای ناشناخته');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl"
         onClick={onClose}>
      <div className="bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-white font-bold">پروایدر سفارشی</h3>
          <button onClick={onClose} className="text-label hover:text-white p-1.5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {/* Template selector */}
          <div>
            <label className="text-label text-xs mb-1.5 block">انتخاب پروایدر</label>
            <select
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue"
            >
              <option value="">-- یکی را انتخاب کن --</option>
              {TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
              ))}
            </select>
            {template?.hint && <p className="text-label text-[10px] mt-1.5">{template.hint}</p>}
          </div>

          {template && (
            <>
              {/* Nickname */}
              <div>
                <label className="text-label text-xs mb-1.5 block">نام (برچسب) <span className="text-danger">*</span></label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="مثلاً OpenRouter Claude"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue"
                />
              </div>

              {/* URL */}
              <div>
                <label className="text-label text-xs mb-1.5 block">URL <span className="text-danger">*</span></label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  dir="ltr"
                  placeholder="https://example.com/v1/chat/completions"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-xs focus:outline-none focus:border-blue"
                />
              </div>

              {/* Model — picker for OpenRouter, text for others */}
              {template.hasModelPicker ? (
                <div>
                  <label className="text-label text-xs mb-1.5 block">مدل <span className="text-danger">*</span></label>
                  {orLoading ? (
                    <div className="text-label text-xs py-2">⏳ در حال بارگذاری مدل‌ها...</div>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-label" />
                        <input
                          type="text"
                          value={orQuery}
                          onChange={(e) => setOrQuery(e.target.value)}
                          placeholder="جستجو در مدل‌ها..."
                          className="w-full bg-bg border border-border rounded-lg pr-9 pl-3 py-2 text-white placeholder-label text-xs focus:outline-none focus:border-blue"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto bg-bg border border-border rounded-lg">
                        {filteredORModels.length === 0 ? (
                          <div className="text-label text-xs p-3 text-center">مدلی پیدا نشد</div>
                        ) : filteredORModels.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setModel(m.id)}
                            className={`w-full text-right px-3 py-2 text-xs border-b border-border last:border-0 hover:bg-blue/10 transition-colors ${
                              model === m.id ? 'bg-blue/20 text-blue' : 'text-white'
                            }`}
                          >
                            <div className="font-medium truncate" dir="ltr">{m.id}</div>
                            {m.pricing.prompt > 0 && (
                              <div className="text-label text-[10px] mt-0.5">
                                ${(m.pricing.prompt * 1e6).toFixed(2)}/M in · ${(m.pricing.completion * 1e6).toFixed(2)}/M out
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <p className="text-label text-[10px] mt-1.5">انتخاب شده: <span dir="ltr" className="text-blue">{model || '—'}</span></p>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-label text-xs mb-1.5 block">نام مدل <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    dir="ltr"
                    placeholder="نام مدل"
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-xs focus:outline-none focus:border-blue"
                  />
                </div>
              )}

              {/* API key */}
              <div>
                <label className="text-label text-xs mb-1.5 block">کلید API <span className="text-danger">*</span></label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    dir="ltr"
                    placeholder="sk-..."
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue pl-10"
                  />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-label">
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger text-xs rounded-lg p-2.5">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border px-4 py-3 flex gap-2">
          <button onClick={onClose}
            className="flex-1 bg-bg border border-border text-label py-2.5 rounded-lg text-sm hover:text-white transition-colors">
            انصراف
          </button>
          <button
            onClick={handleSave}
            disabled={!template || saving || !nickname || !url || !model || !apiKey}
            className="flex-1 bg-blue text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-hover disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
          >
            <Check size={14} />
            {saving ? '...' : 'تأیید و افزودن'}
          </button>
        </div>
      </div>
    </div>
  );
}
