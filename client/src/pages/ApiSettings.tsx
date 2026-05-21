import { useState, useEffect } from 'react';
import { Key, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/client';

const PROVIDERS = [
  { id: 'gemini',   name: 'Google Gemini',  icon: '🧠', model: 'gemini-2.0-flash' },
  { id: 'openai',   name: 'OpenAI GPT-4o',  icon: '🤖', model: 'gpt-4o' },
  { id: 'claude',   name: 'Claude Sonnet',  icon: '✦',  model: 'claude-sonnet-4-6' },
  { id: 'deepseek', name: 'DeepSeek',       icon: '🔍', model: 'deepseek-chat' },
  { id: 'grok',     name: 'Grok (xAI)',     icon: '⚡', model: 'grok-3-mini' },
  { id: 'mistral',  name: 'Mistral AI',     icon: '🌬️', model: 'mistral-small-latest' },
];

export default function ApiSettings() {
  const [keys, setKeys]     = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [show, setShow]     = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast]   = useState('');

  useEffect(() => {
    api.get('/ai/keys').then(r => {
      const map: Record<string, boolean> = {};
      r.data.forEach((k: { provider: string; hasKey: boolean }) => { map[k.provider] = k.hasKey; });
      setKeys(map);
    });
  }, []);

  async function save(provider: string) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving(provider);
    try {
      await api.post('/ai/keys', { provider, apiKey: key });
      setKeys(k => ({ ...k, [provider]: true }));
      setInputs(i => ({ ...i, [provider]: '' }));
      showToast(`کلید ${provider} ذخیره شد ✓`);
    } catch (e: any) {
      showToast(e.response?.data?.error || 'خطا');
    } finally { setSaving(null); }
  }

  async function remove(provider: string) {
    await api.delete(`/ai/keys/${provider}`);
    setKeys(k => ({ ...k, [provider]: false }));
    showToast('کلید حذف شد');
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
        {PROVIDERS.map(p => (
          <div key={p.id} className={`bg-surface border rounded-xl p-4 transition-colors ${keys[p.id] ? 'border-blue/40' : 'border-border'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <div className="text-white font-medium text-sm">{p.name}</div>
                  <div className="text-label text-xs">{p.model}</div>
                </div>
              </div>
              {keys[p.id] && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-success text-xs">
                    <Check size={12} /> فعال
                  </div>
                  <button onClick={() => remove(p.id)} className="text-danger/60 hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {!keys[p.id] && (
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
                  onClick={() => save(p.id)}
                  disabled={saving === p.id || !inputs[p.id]}
                  className="bg-blue disabled:opacity-40 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-hover transition-colors flex items-center gap-1"
                >
                  {saving === p.id ? '...' : <><Key size={14} /> ذخیره</>}
                </button>
              </div>
            )}

            {keys[p.id] && (
              <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                <Key size={12} className="text-success" />
                <span className="text-success text-xs">کلید شخصی تنظیم شده — بدون محدودیت سهمیه</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
