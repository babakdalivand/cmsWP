import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Youtube, Plus, Trash2, RefreshCw, Check, X, List,
  BarChart3, Settings, ChevronDown, ChevronUp, Play,
} from 'lucide-react';
import { api } from '../api/client';

type Tab = 'channels' | 'queue' | 'playlists' | 'analytics' | 'settings';

/* ── hooks ── */
const useYT = (path: string, params?: Record<string, any>) =>
  useQuery({ queryKey: ['yt', path, params], queryFn: () => api.get('/youtube' + path, { params }).then(r => r.data), staleTime: 30000 });

export default function YouTubeManager() {
  const [tab, setTab] = useState<Tab>('channels');

  const tabs: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: 'channels',  icon: <Youtube size={16} />,   label: 'کانال‌ها'   },
    { key: 'queue',     icon: <List size={16} />,       label: 'صف'          },
    { key: 'playlists', icon: <Play size={16} />,       label: 'پلی‌لیست'   },
    { key: 'analytics', icon: <BarChart3 size={16} />,  label: 'آنالیتیکس'  },
    { key: 'settings',  icon: <Settings size={16} />,   label: 'تنظیمات'    },
  ];

  return (
    <div className="px-4 pt-5 pb-28" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ff0000' }}>
          <Youtube size={20} color="#fff" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none">یوتیوب منیجر</h1>
          <p className="text-xs" style={{ color: 'var(--label)' }}>مدیریت کانال‌ها، صف و آنالیتیکس</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              background: tab === t.key ? 'var(--primary)' : 'var(--surface)',
              color:      tab === t.key ? '#fff' : 'var(--label)',
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'channels'  && <ChannelsTab />}
      {tab === 'queue'     && <QueueTab />}
      {tab === 'playlists' && <PlaylistsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'settings'  && <SettingsTab />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CHANNELS TAB
═══════════════════════════════════════════════════════════════ */
function ChannelsTab() {
  const qc = useQueryClient();
  const { data: channels = [], isLoading } = useYT('/channels');
  const [input, setInput] = useState('');
  const [lang, setLang]   = useState('fa');
  const [expanded, setExpanded] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.post('/youtube/channels', { channel_input: input, lang }).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['yt', '/channels'] }); setInput(''); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/youtube/channels/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['yt', '/channels'] }),
  });

  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/youtube/channels/${id}`, data).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['yt', '/channels'] }),
  });

  const sync = useMutation({
    mutationFn: () => api.post('/youtube/sync').then(r => r.data),
    onSuccess:  (d) => alert(`✅ ${Object.values(d.results || {}).reduce((a: any, r: any) => a + (r.queued||0), 0)} ویدیو به صف اضافه شد`),
  });

  return (
    <div className="space-y-4">
      {/* Add channel */}
      <div className="raha-card p-4 space-y-3">
        <p className="text-sm font-semibold">افزودن کانال</p>
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="لینک یا Channel ID (UCxxx...)"
          className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
        <div className="flex gap-2">
          <select value={lang} onChange={e => setLang(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm flex-shrink-0" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <option value="fa">FA فارسی</option>
            <option value="en">EN English</option>
          </select>
          <button onClick={() => add.mutate()} disabled={!input || add.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--primary)', color: '#fff', opacity: add.isPending ? .6 : 1 }}>
            <Plus size={16} />{add.isPending ? 'در حال افزودن...' : 'افزودن'}
          </button>
        </div>
      </div>

      {/* Sync button */}
      <button onClick={() => sync.mutate()} disabled={sync.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
        {sync.isPending ? 'در حال همگام‌سازی...' : 'همگام‌سازی همه کانال‌ها'}
      </button>

      {/* Channel list */}
      {isLoading && <p className="text-sm text-center py-4" style={{ color: 'var(--label)' }}>در حال بارگذاری...</p>}
      {channels.map((ch: any) => (
        <div key={ch.id} className="raha-card overflow-hidden">
          <div className="flex items-center gap-3 p-3 cursor-pointer"
            onClick={() => setExpanded(expanded === ch.id ? null : ch.id)}>
            {ch.thumbnail && <img src={ch.thumbnail} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{ch.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--label)' }}>{ch.subscribers?.toLocaleString()} مشترک</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: ch.enabled ? '#22c55e20' : '#ef444420', color: ch.enabled ? '#22c55e' : '#ef4444' }}>
                {ch.enabled ? 'فعال' : 'غیرفعال'}
              </span>
              {expanded === ch.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {expanded === ch.id && (
            <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                {[
                  { k: 'enabled',       l: 'فعال'      },
                  { k: 'import_videos', l: 'ویدیوها'   },
                  { k: 'import_shorts', l: 'شورت‌ها'   },
                  { k: 'show_live',     l: 'لایو'       },
                ].map(({ k, l }) => (
                  <label key={k} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" defaultChecked={ch[k]}
                      onChange={e => patch.mutate({ id: ch.id, data: { [k]: e.target.checked } })} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <select defaultValue={ch.lang} onChange={e => patch.mutate({ id: ch.id, data: { lang: e.target.value } })}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <option value="fa">FA فارسی</option>
                  <option value="en">EN English</option>
                </select>
                <button onClick={() => { if (confirm('حذف شود؟')) remove.mutate(ch.id); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: '#ef444420', color: '#ef4444' }}>
                  <Trash2 size={13} />حذف
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   QUEUE TAB
═══════════════════════════════════════════════════════════════ */
function QueueTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLang, setEditLang]   = useState('fa');

  const { data, isLoading } = useYT('/queue', { status, limit: 50 });
  const items: any[] = data?.items || [];
  const total: number = data?.total || 0;

  const approve = useMutation({
    mutationFn: ({ id, title, lang }: { id: number; title?: string; lang?: string }) =>
      api.post(`/youtube/queue/${id}/approve`, { title, lang }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['yt', '/queue'] }); setEditId(null); },
  });

  const reject = useMutation({
    mutationFn: (id: number) => api.post(`/youtube/queue/${id}/reject`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['yt', '/queue'] }),
  });

  const statusColors: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444' };
  const statusLabels: Record<string, string> = { pending: 'در انتظار', approved: 'منتشر', rejected: 'رد شده' };

  return (
    <div className="space-y-3">
      {/* Status filter */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: status === s ? statusColors[s] + '30' : 'var(--surface)',
              color:      status === s ? statusColors[s] : 'var(--label)',
              border:     status === s ? `2px solid ${statusColors[s]}` : '2px solid transparent',
            }}>
            {statusLabels[s]}
            {status === s && <span className="mr-1">({total})</span>}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}
      {!isLoading && !items.length && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>موردی نیست</p>}

      {items.map((item: any) => (
        <div key={item.id} className="raha-card p-3 space-y-2">
          <div className="flex gap-3">
            {item.thumbnail && (
              <img src={item.thumbnail} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" alt="" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold line-clamp-2 leading-snug">{item.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs" style={{ color: 'var(--label)' }}>
                  {item.type === 'short' ? '📱' : '🎬'} {item.type}
                </span>
                {item.duration_sec > 0 && (
                  <span className="text-xs" style={{ color: 'var(--label)' }}>
                    {Math.floor(item.duration_sec / 60)}:{String(item.duration_sec % 60).padStart(2, '0')}
                  </span>
                )}
                {item.published_at && (
                  <span className="text-xs" style={{ color: 'var(--label)' }}>
                    {item.published_at.slice(0, 10)}
                  </span>
                )}
              </div>
              <a href={`https://youtu.be/${item.yt_id}`} target="_blank" rel="noreferrer"
                className="text-xs mt-1 inline-block" style={{ color: 'var(--primary)' }}>
                مشاهده در یوتیوب ↗
              </a>
            </div>
          </div>

          {status === 'pending' && (
            <>
              {editId === item.id ? (
                <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    placeholder="عنوان سفارشی (اختیاری)"
                    className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
                  <div className="flex gap-2">
                    <select value={editLang} onChange={e => setEditLang(e.target.value)}
                      className="rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <option value="fa">FA فارسی</option>
                      <option value="en">EN English</option>
                    </select>
                    <button onClick={() => approve.mutate({ id: item.id, title: editTitle || undefined, lang: editLang })}
                      disabled={approve.isPending}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: '#22c55e', color: '#fff' }}>
                      <Check size={14} />منتشر کن
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface)' }}>
                      لغو
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditId(item.id); setEditTitle(item.title); setEditLang('fa'); }}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold"
                    style={{ background: '#22c55e20', color: '#22c55e' }}>
                    <Check size={14} />انتشار
                  </button>
                  <button onClick={() => { if (confirm('رد شود؟')) reject.mutate(item.id); }}
                    disabled={reject.isPending}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold"
                    style={{ background: '#ef444420', color: '#ef4444' }}>
                    <X size={14} />رد
                  </button>
                </div>
              )}
            </>
          )}

          {status === 'approved' && item.post_id && (
            <p className="text-xs" style={{ color: '#22c55e' }}>✓ پست #{item.post_id} ایجاد شد</p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PLAYLISTS TAB
═══════════════════════════════════════════════════════════════ */
function PlaylistsTab() {
  const qc = useQueryClient();
  const { data: channels = [] } = useYT('/channels');
  const [selCh, setSelCh]       = useState('');
  const chId = selCh || channels[0]?.id || '';

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['yt', '/playlists', chId],
    queryFn:  () => chId ? api.get(`/youtube/channels/${chId}/playlists`).then(r => r.data) : Promise.resolve([]),
    enabled:  !!chId,
  });

  const importPl = useMutation({
    mutationFn: (pl_id: string) => api.post(`/youtube/playlists/${encodeURIComponent(pl_id)}/import`, { channel_id: chId }).then(r => r.data),
    onSuccess:  (d) => { qc.invalidateQueries({ queryKey: ['yt', '/queue'] }); alert(`✅ ${d.queued} ویدیو به صف اضافه شد`); },
  });

  return (
    <div className="space-y-4">
      <div className="raha-card p-3">
        <p className="text-xs mb-2" style={{ color: 'var(--label)' }}>انتخاب کانال</p>
        <select value={selCh || chId} onChange={e => setSelCh(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}
      {!isLoading && !playlists.length && chId && <p className="text-center text-sm py-4" style={{ color: 'var(--label)' }}>پلی‌لیستی یافت نشد</p>}

      {playlists.map((pl: any) => (
        <div key={pl.id} className="raha-card p-3 flex items-center gap-3">
          {pl.snippet?.thumbnails?.default?.url && (
            <img src={pl.snippet.thumbnails.default.url} className="w-16 h-12 object-cover rounded-lg flex-shrink-0" alt="" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{pl.snippet?.title}</p>
            <p className="text-xs" style={{ color: 'var(--label)' }}>{pl.contentDetails?.itemCount} ویدیو</p>
          </div>
          <button onClick={() => importPl.mutate(pl.id)} disabled={importPl.isPending}
            className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--primary)', color: '#fff', opacity: importPl.isPending ? .6 : 1 }}>
            افزودن به صف
          </button>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ANALYTICS TAB
═══════════════════════════════════════════════════════════════ */
function AnalyticsTab() {
  const { data: items = [], isLoading } = useYT('/analytics', { limit: 20 });

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--label)' }}>آخرین ۲۰ ویدیوی منتشر شده + آمار یوتیوب</p>
      {isLoading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}
      {items.map((item: any) => (
        <div key={item.yt_id} className="raha-card p-3">
          <p className="text-sm font-semibold mb-2 line-clamp-2 leading-snug">{item.title}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '👁 بازدید', value: item.yt_views?.toLocaleString() || '—' },
              { label: '👍 لایک',  value: item.yt_likes?.toLocaleString()  || '—' },
              { label: '💬 کامنت', value: item.yt_comments?.toLocaleString() || '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-2 text-center" style={{ background: 'var(--bg)' }}>
                <p className="text-xs" style={{ color: 'var(--label)' }}>{label}</p>
                <p className="text-sm font-bold mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <a href={`https://youtu.be/${item.yt_id}`} target="_blank" rel="noreferrer"
            className="text-xs mt-2 inline-block" style={{ color: 'var(--primary)' }}>
            مشاهده در یوتیوب ↗
          </a>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SETTINGS TAB
═══════════════════════════════════════════════════════════════ */
function SettingsTab() {
  const qc = useQueryClient();
  const { data: cfg } = useYT('/settings');
  const [apiKey, setApiKey] = useState('');
  const [interval, setInterval] = useState('hourly');

  const save = useMutation({
    mutationFn: () => api.patch('/youtube/settings', {
      ...(apiKey ? { api_key: apiKey } : {}),
      sync_interval: interval,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['yt', '/settings'] }); alert('✅ ذخیره شد'); setApiKey(''); },
  });

  const sync = useMutation({
    mutationFn: () => api.post('/youtube/sync').then(r => r.data),
    onSuccess: (d) => alert(`✅ همگام‌سازی انجام شد`),
  });

  return (
    <div className="space-y-4">
      <div className="raha-card p-4 space-y-3">
        <p className="text-sm font-semibold">YouTube Data API v3</p>
        <p className="text-xs" style={{ color: 'var(--label)' }}>
          وضعیت: <span style={{ color: cfg?.api_key ? '#22c55e' : '#ef4444' }}>
            {cfg?.api_key ? '✓ تنظیم شده' : '✗ تنظیم نشده'}
          </span>
        </p>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)}
          placeholder="AIza... (فقط برای تغییر وارد کنید)"
          className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
      </div>

      <div className="raha-card p-4 space-y-3">
        <p className="text-sm font-semibold">بازه همگام‌سازی</p>
        <select value={interval} onChange={e => setInterval(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <option value="hourly">هر ساعت</option>
          <option value="twicedaily">هر ۱۲ ساعت</option>
          <option value="daily">روزانه</option>
        </select>
      </div>

      {cfg && (
        <div className="raha-card p-4 space-y-2 text-xs" style={{ color: 'var(--label)' }}>
          <p>Webhook URL:</p>
          <code className="block break-all text-xs p-2 rounded" style={{ background: 'var(--bg)' }}>{cfg.webhook_url}</code>
          {cfg.last_sync && <p>آخرین سینک: {cfg.last_sync}</p>}
          {cfg.next_sync && <p>سینک بعدی: {new Date(cfg.next_sync * 1000).toLocaleString('fa')}</p>}
        </div>
      )}

      <button onClick={() => save.mutate()} disabled={save.isPending}
        className="w-full py-3 rounded-xl text-sm font-bold"
        style={{ background: 'var(--primary)', color: '#fff', opacity: save.isPending ? .6 : 1 }}>
        {save.isPending ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
      </button>

      <button onClick={() => sync.mutate()} disabled={sync.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
        {sync.isPending ? 'در حال همگام‌سازی...' : 'همگام‌سازی دستی'}
      </button>
    </div>
  );
}
