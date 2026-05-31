import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Cloud, HardDrive, CheckCircle2, Clock, XCircle, RefreshCw,
  Plus, Trash2, Star, Wifi, WifiOff, Settings, ChevronRight, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StorageStatus {
  site?:     string;
  files:     { synced: number; pending: number; failed: number; orphan: number };
  total:     number;
  providers: { id: number; name: string; type: string; default: boolean; healthy: boolean | null }[];
  queue:     { pending: number; processing: number; completed: number; failed: number };
}

interface Provider {
  id: number; name: string; type: string;
  is_default: number; is_active: number;
  last_ping_ok: string | null;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Icon size={20} className={`mx-auto mb-1 ${color}`} />
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--label)' }}>{label}</div>
    </div>
  );
}

function ProviderBadge({ type }: { type: string }) {
  const map: Record<string, string> = { r2: 'R2', s3: 'S3', b2: 'B2', gdrive: 'Drive', local: 'Local' };
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(79,184,180,0.15)', color: 'var(--primary)' }}>
      {map[type] ?? type.toUpperCase()}
    </span>
  );
}

// ── Add Provider Form ─────────────────────────────────────────────────────────
function AddProviderSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState('r2');
  const [name, setName] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});

  const FIELDS: Record<string, { key: string; label: string; secret?: boolean }[]> = {
    r2:     [{ key: 'account_id', label: 'Account ID' }, { key: 'bucket', label: 'Bucket' }, { key: 'access_key_id', label: 'Access Key ID' }, { key: 'secret_access_key', label: 'Secret Access Key', secret: true }, { key: 'public_domain', label: 'CDN Domain (optional)' }],
    s3:     [{ key: 'bucket', label: 'Bucket' }, { key: 'region', label: 'Region' }, { key: 'access_key_id', label: 'Access Key ID' }, { key: 'secret_access_key', label: 'Secret Access Key', secret: true }, { key: 'cdn_domain', label: 'CDN Domain (optional)' }],
    b2:     [{ key: 'key_id', label: 'Key ID' }, { key: 'application_key', label: 'Application Key', secret: true }, { key: 'bucket', label: 'Bucket' }, { key: 'endpoint', label: 'Endpoint' }, { key: 'cdn_domain', label: 'CDN Domain (optional)' }],
    gdrive: [{ key: 'client_email', label: 'Service Account Email' }, { key: 'folder_id', label: 'Folder ID' }, { key: 'private_key', label: 'Private Key (PEM)', secret: true }],
    local:  [{ key: 'base_path', label: 'Base Path' }, { key: 'base_url', label: 'Base URL' }],
  };

  const save = useMutation({
    mutationFn: () => api.post('/storage/providers', { name, type, credentials: creds }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['storage'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl p-5 pb-28" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />
        <h3 className="text-lg font-black mb-4" style={{ color: 'var(--text)' }}>افزودن Provider</h3>

        <div className="space-y-3">
          <input className="w-full px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            placeholder="نام Provider" value={name} onChange={e => setName(e.target.value)} />

          <div className="grid grid-cols-5 gap-2">
            {['r2','s3','b2','gdrive','local'].map(t => (
              <button key={t} onClick={() => setType(t)}
                className="py-2 rounded-xl text-[11px] font-bold transition-all"
                style={{ background: type === t ? 'var(--primary)' : 'var(--bg)', color: type === t ? '#fff' : 'var(--label)', border: '1px solid var(--border)' }}>
                {t === 'gdrive' ? 'DRIVE' : t.toUpperCase()}
              </button>
            ))}
          </div>

          {FIELDS[type]?.map(f => (
            <input key={f.key} type={f.secret ? 'password' : 'text'}
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder={f.label}
              value={creds[f.key] || ''}
              onChange={e => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))} />
          ))}

          <button onClick={() => save.mutate()} disabled={!name || save.isPending}
            className="w-full py-3.5 rounded-xl font-bold text-white transition-opacity"
            style={{ background: 'var(--grad-primary)', opacity: save.isPending ? 0.6 : 1 }}>
            {save.isPending ? 'در حال ذخیره...' : 'ذخیره'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CloudStorage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd]   = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [siteKey, setSiteKey]   = useState('');
  const [tab, setTab]           = useState<'overview'|'providers'|'logs'>('overview');

  const { data: status, isLoading, error } = useQuery<StorageStatus>({
    queryKey: ['storage', 'status'],
    queryFn:  () => api.get('/storage/status').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['storage', 'providers'],
    queryFn:  () => api.get('/storage/providers').then(r => r.data),
    enabled:  tab === 'providers',
  });

  const { data: logs = [] } = useQuery<any[]>({
    queryKey: ['storage', 'logs'],
    queryFn:  () => api.get('/storage/logs').then(r => r.data),
    enabled:  tab === 'logs',
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/storage/sync', { action: 'migrate_local' }).then(r => r.data),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['storage'] }); alert(`${d.queued} فایل در صف قرار گرفت`); },
  });

  const deleteProv = useMutation({
    mutationFn: (id: number) => api.delete(`/storage/providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage'] }),
  });

  const setDefault = useMutation({
    mutationFn: (id: number) => api.post(`/storage/providers/${id}/default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['storage'] }),
  });

  const saveKey = useMutation({
    mutationFn: () => api.post('/storage/site-key', { site_key: siteKey }).then(r => r.data),
    onSuccess: () => { setShowConfig(false); qc.invalidateQueries({ queryKey: ['storage'] }); },
  });

  const testConn = useMutation({
    mutationFn: () => api.get('/storage/test').then(r => r.data),
    onSuccess: (d) => alert(d.ok ? `✅ متصل — ${d.site}` : `❌ ${d.error}`),
    onError: (e: any) => alert('❌ ' + (e.response?.data?.error || e.message)),
  });

  // ── Not connected ────────────────────────────────────────────────────────
  if (!isLoading && (error || !status?.site)) {
    return (
      <div className="p-4 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Cloud size={24} style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>Cloud Storage</h1>
        </div>

        <div className="rounded-2xl p-5 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <WifiOff size={40} className="mx-auto mb-3" style={{ color: 'var(--label)' }} />
          <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>پلاگین متصل نیست</p>
          <p className="text-sm mb-4" style={{ color: 'var(--label)' }}>ابتدا پلاگین Cloud Media Manager را در وردپرس فعال کرده و Site Key را تنظیم کنید.</p>
          <button onClick={() => setShowConfig(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'var(--grad-primary)' }}>
            تنظیم Site Key
          </button>
        </div>

        {showConfig && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowConfig(false)}>
            <div className="w-full rounded-t-2xl p-5" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />
              <h3 className="font-black mb-3" style={{ color: 'var(--text)' }}>Site Key</h3>
              <p className="text-sm mb-3" style={{ color: 'var(--label)' }}>این کلید باید با مقدار Site Key در تنظیمات پلاگین وردپرس یکسان باشد.</p>
              <input className="w-full px-4 py-3 rounded-xl text-sm mb-3"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="Site Key..." value={siteKey} onChange={e => setSiteKey(e.target.value)} />
              <button onClick={() => saveKey.mutate()} disabled={!siteKey || saveKey.isPending}
                className="w-full py-3 rounded-xl font-bold text-white"
                style={{ background: 'var(--grad-primary)' }}>
                {saveKey.isPending ? 'ذخیره...' : 'ذخیره و اتصال'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const f = status?.files ?? { synced: 0, pending: 0, failed: 0, orphan: 0 };
  const syncPct = status?.total ? Math.round((f.synced / status.total) * 100) : 0;

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Cloud size={24} style={{ color: 'var(--primary)' }} />
          <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>Cloud Storage</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => testConn.mutate()} disabled={testConn.isPending}
            className="p-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Wifi size={16} style={{ color: 'var(--primary)' }} />
          </button>
          <button onClick={() => setShowConfig(true)}
            className="p-2 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Settings size={16} style={{ color: 'var(--label)' }} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--surface)' }}>
        {(['overview','providers','logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
            style={{ background: tab === t ? 'var(--primary)' : 'transparent', color: tab === t ? '#fff' : 'var(--label)' }}>
            {t === 'overview' ? 'خلاصه' : t === 'providers' ? 'Provider‌ها' : 'لاگ‌ها'}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <>
          {/* Stats */}
          <div className="flex gap-3 mb-4">
            <StatCard icon={CheckCircle2} label="سینک شده" value={f.synced}  color="text-green-400" />
            <StatCard icon={Clock}        label="در صف"     value={f.pending} color="text-yellow-400" />
            <StatCard icon={XCircle}      label="خطا"       value={f.failed}  color="text-red-400" />
          </div>

          {/* Progress bar */}
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between text-sm mb-2">
              <span style={{ color: 'var(--text)' }}>پیشرفت سینک</span>
              <span className="font-black" style={{ color: 'var(--primary)' }}>{syncPct}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${syncPct}%`, background: 'var(--grad-primary)' }} />
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--label)' }}>{f.synced} از {status?.total ?? 0} فایل</p>
          </div>

          {/* Queue status */}
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>صف پردازش</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'در انتظار', val: status?.queue?.pending ?? 0, cls: 'text-yellow-400' },
                { label: 'در حال اجرا', val: status?.queue?.processing ?? 0, cls: 'text-blue-400' },
                { label: 'خطا', val: status?.queue?.failed ?? 0, cls: 'text-red-400' },
              ].map(({ label, val, cls }) => (
                <div key={label}>
                  <p className={`text-xl font-black ${cls}`}>{val}</p>
                  <p className="text-[10px]" style={{ color: 'var(--label)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Active providers summary */}
          {(status?.providers?.length ?? 0) > 0 && (
            <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Provider‌های فعال</p>
              {(status?.providers ?? []).map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.healthy === true ? 'bg-green-400' : p.healthy === false ? 'bg-red-400' : 'bg-gray-400'}`} />
                  <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{p.name}</span>
                  <ProviderBadge type={p.type} />
                  {p.default && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,160,23,0.15)', color: '#D4A017' }}>پیش‌فرض</span>}
                </div>
              ))}
            </div>
          )}

          {/* Sync button */}
          <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-opacity"
            style={{ background: 'var(--grad-primary)', opacity: syncMutation.isPending ? 0.6 : 1 }}>
            <RefreshCw size={18} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'در حال قرار دادن در صف...' : 'شروع سینک فایل‌های محلی'}
          </button>
        </>
      )}

      {/* ── Providers ── */}
      {tab === 'providers' && (
        <>
          <button onClick={() => setShowAdd(true)}
            className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mb-4"
            style={{ background: 'var(--grad-primary)' }}>
            <Plus size={18} /> افزودن Provider جدید
          </button>

          {providers.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <HardDrive size={36} className="mx-auto mb-3" style={{ color: 'var(--label)' }} />
              <p style={{ color: 'var(--label)' }}>هیچ Provider‌ای تنظیم نشده</p>
            </div>
          ) : providers.map(p => (
            <div key={p.id} className="rounded-2xl p-4 mb-3 flex items-center gap-3"
              style={{ background: 'var(--surface)', border: `1px solid ${p.is_default ? 'rgba(212,160,23,0.4)' : 'var(--border)'}` }}>
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${p.last_ping_ok === '1' ? 'bg-green-400' : p.last_ping_ok === '0' ? 'bg-red-400' : 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                <ProviderBadge type={p.type} />
              </div>
              {!p.is_default && (
                <button onClick={() => setDefault.mutate(p.id)} className="p-1.5 rounded-lg" style={{ background: 'var(--bg)' }} title="تنظیم به عنوان پیش‌فرض">
                  <Star size={14} style={{ color: 'var(--label)' }} />
                </button>
              )}
              {p.is_default ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,160,23,0.15)', color: '#D4A017' }}>پیش‌فرض</span> : null}
              <button onClick={() => { if (confirm('حذف شود؟')) deleteProv.mutate(p.id); }}
                className="p-1.5 rounded-lg" style={{ background: 'var(--bg)' }}>
                <Trash2 size={14} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </>
      )}

      {/* ── Logs ── */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: 'var(--label)' }}>لاگی وجود ندارد</p>
          ) : logs.map((l: any) => (
            <div key={l.id} className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${l.level === 'error' ? 'bg-red-500/20 text-red-400' : l.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                  {l.level.toUpperCase()}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--label)' }}>{l.created_at}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text)' }}>{l.message}</p>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddProviderSheet onClose={() => setShowAdd(false)} />}

      {/* Config Sheet */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowConfig(false)}>
          <div className="w-full rounded-t-2xl p-5" style={{ background: 'var(--surface)' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--border)' }} />
            <h3 className="font-black mb-3" style={{ color: 'var(--text)' }}>تنظیمات اتصال</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--label)' }}>Site Key باید با مقدار تنظیم‌شده در Cloud Media → Settings وردپرس یکی باشد.</p>
            <input className="w-full px-4 py-3 rounded-xl text-sm mb-3"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              placeholder="Site Key..." value={siteKey} onChange={e => setSiteKey(e.target.value)} />
            <button onClick={() => saveKey.mutate()} disabled={!siteKey || saveKey.isPending}
              className="w-full py-3 rounded-xl font-bold text-white mb-2"
              style={{ background: 'var(--grad-primary)' }}>
              {saveKey.isPending ? 'ذخیره...' : 'ذخیره'}
            </button>
            <button onClick={() => testConn.mutate()} disabled={testConn.isPending}
              className="w-full py-3 rounded-xl font-bold text-sm"
              style={{ background: 'var(--bg)', color: 'var(--primary)', border: '1px solid var(--border)' }}>
              تست اتصال
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
