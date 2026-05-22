import { useState, useEffect } from 'react';
import { Key, Check, Trash2, Eye, EyeOff, TestTube2, Settings } from 'lucide-react';
import { api } from '../api/client';

interface Provider {
  id: string;
  name: string;
  icon: string;
  model: string;
  isCustom?: boolean;
}

const PROVIDERS: Provider[] = [
  { id: 'gemini',   name: 'Google Gemini',  icon: '🧠', model: 'gemini-2.5-flash' },
  { id: 'openai',   name: 'OpenAI GPT-4o',  icon: '🤖', model: 'gpt-4o' },
  { id: 'claude',   name: 'Claude Sonnet',  icon: '✦',  model: 'claude-sonnet-4-6' },
  { id: 'deepseek', name: 'DeepSeek',       icon: '🔍', model: 'deepseek-chat' },
  { id: 'grok',     name: 'Grok (xAI)',     icon: '⚡', model: 'grok-3-mini' },
  { id: 'mistral',  name: 'Mistral AI',     icon: '🌬️', model: 'mistral-small-latest' },
  { id: 'custom',   name: 'پروایدر سفارشی',  icon: '⚙️', model: 'OpenAI-compatible', isCustom: true },
];

type TestResult = { ok: boolean; message?: string; error?: string; sample?: string };

export default function ApiSettings() {
  const [keys, setKeys]       = useState<Record<string, boolean>>({});
  const [inputs, setInputs]   = useState<Record<string, string>>({});
  const [customUrl, setCustomUrl]     = useState('');
  const [customModel, setCustomModel] = useState('');
  const [show, setShow]       = useState<Record<string, boolean>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({});
  const [toast, setToast]     = useState('');

  useEffect(() => {
    api.get('/ai/keys').then(r => {
      const map: Record<string, boolean> = {};
      r.data.forEach((k: { provider: string; hasKey: boolean }) => { map[k.provider] = k.hasKey; });
      setKeys(map);
    });
  }, []);

  async function save(p: Provider) {
    const key = inputs[p.id]?.trim();
    if (!key) return;
    if (p.isCustom && (!customUrl.trim() || !customModel.trim())) {
      showToast('برای پروایدر سفارشی، URL و مدل الزامی است');
      return;
    }
    setSaving(p.id);
    try {
      const body: any = { provider: p.id, apiKey: key };
      if (p.isCustom) { body.customUrl = customUrl.trim(); body.customModel = customModel.trim(); }
      await api.post('/ai/keys', body);
      setKeys(k => ({ ...k, [p.id]: true }));
      setInputs(i => ({ ...i, [p.id]: '' }));
      showToast(`کلید ${p.name} ذخیره شد ✓`);
    } catch (e: any) {
      showToast(e.response?.data?.error || 'خطا');
    } finally { setSaving(null); }
  }

  async function remove(provider: string) {
    await api.delete(`/ai/keys/${provider}`);
    setKeys(k => ({ ...k, [provider]: false }));
    setTestResult(t => { const c = { ...t }; delete c[provider]; return c; });
    showToast('کلید حذف شد');
  }

  async function testKey(provider: string) {
    setTesting(provider);
    setTestResult(t => ({ ...t, [provider]: { ok: false, message: 'در حال تست...' } }));
    try {
      const { data } = await api.post('/ai/test', { provider });
      setTestResult(t => ({ ...t, [provider]: data }));
    } catch (e: any) {
      setTestResult(t => ({ ...t, [provider]: { ok: false, error: e.response?.data?.error || e.message } }));
    } finally { setTesting(null); }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <h1 className="text-white font-bold text-xl mb-2">تنظیمات کلید AI</h1>
      <p className="text-label text-sm mb-6">با وارد کردن کلید شخصی، سهمیه روزانه شما مصرف نمی‌شود (BYOK)</p>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-surface border border-blue/30 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {PROVIDERS.map(p => {
          const has    = keys[p.id];
          const result = testResult[p.id];
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
                {has && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-success text-xs">
                      <Check size={12} /> فعال
                    </div>
                    <button onClick={() => testKey(p.id)} disabled={testing === p.id}
                      className="text-blue hover:bg-blue/10 p-1.5 rounded-lg disabled:opacity-40" title="تست اتصال">
                      <TestTube2 size={14} />
                    </button>
                    <button onClick={() => remove(p.id)} className="text-danger/70 hover:text-danger p-1.5 rounded-lg hover:bg-danger/10" title="حذف">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {!has && (
                <div className="flex flex-col gap-2">
                  {p.isCustom && (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={customUrl}
                        onChange={e => setCustomUrl(e.target.value)}
                        placeholder="API URL (مثلاً https://example.com/v1/chat/completions)"
                        dir="ltr"
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-xs focus:outline-none focus:border-blue"
                      />
                      <input
                        type="text"
                        value={customModel}
                        onChange={e => setCustomModel(e.target.value)}
                        placeholder="نام مدل (مثلاً llama-3.1-70b)"
                        dir="ltr"
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-xs focus:outline-none focus:border-blue"
                      />
                      <p className="text-label text-[10px] flex items-center gap-1">
                        <Settings size={10} /> فقط APIهای سازگار با OpenAI پشتیبانی می‌شوند
                      </p>
                    </div>
                  )}
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
                      onClick={() => save(p)}
                      disabled={saving === p.id || !inputs[p.id]}
                      className="bg-blue disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-hover transition-colors flex items-center gap-1"
                    >
                      {saving === p.id ? '...' : <><Key size={14} /> ذخیره</>}
                    </button>
                  </div>
                </div>
              )}

              {has && !result && (
                <div className="flex items-center justify-between bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Key size={12} className="text-success" />
                    <span className="text-success text-xs">کلید شخصی تنظیم شده</span>
                  </div>
                  <button onClick={() => testKey(p.id)} disabled={testing === p.id}
                    className="text-blue text-xs flex items-center gap-1 hover:text-blue-hover disabled:opacity-40">
                    <TestTube2 size={12} /> تست
                  </button>
                </div>
              )}

              {result && (
                <div className={`rounded-lg px-3 py-2 text-xs border ${
                  result.ok ? 'bg-success/5 border-success/30 text-success'
                    : testing === p.id ? 'bg-blue/5 border-blue/30 text-blue'
                    : 'bg-danger/5 border-danger/30 text-danger'
                }`}>
                  {testing === p.id ? (
                    <span className="animate-pulse">⏳ {result.message}</span>
                  ) : result.ok ? (
                    <div>
                      <div className="flex items-center gap-1 font-medium mb-1">
                        <Check size={12} /> {result.message || 'اتصال موفق'}
                      </div>
                      {result.sample && <div className="text-success/80 mt-1">پاسخ مدل: <span dir="auto">{result.sample}</span></div>}
                    </div>
                  ) : (
                    <div>
                      <div className="font-medium mb-1">❌ خطا در اتصال</div>
                      <div className="text-danger/80 break-words">{result.error}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
