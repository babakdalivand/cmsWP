import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Youtube, Plus, Trash2, RefreshCw, Check, X, List,
  BarChart3, Settings, ChevronDown, ChevronUp, Play,
  Search, Zap, Users, Bell, Smartphone, TrendingUp, TrendingDown,
  Clock, Award, Target, FileText, Minus,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import { api } from '../api/client';
import { useRealtime } from '../hooks/useRealtime';

type Tab = 'channels' | 'queue' | 'shorts' | 'playlists' | 'analytics' | 'settings';

const useYT = (path: string, params?: Record<string, any>) =>
  useQuery({
    queryKey: ['yt', path, params],
    queryFn:  () => api.get('/youtube' + path, { params }).then(r => r.data),
    staleTime: 30000,
  });

export default function YouTubeManager() {
  const [tab, setTab] = useState<Tab>('queue');
  useRealtime(30_000);

  const { data: queueData } = useYT('/queue', { status: 'pending', limit: 1 });
  const pendingCount: number = queueData?.total || 0;

  const tabs: { key: Tab; icon: React.ReactNode; label: string; badge?: number }[] = [
    { key: 'channels',  icon: <Youtube size={14} />,    label: 'کانال‌ها'  },
    { key: 'queue',     icon: <List size={14} />,        label: 'صف', badge: pendingCount },
    { key: 'shorts',    icon: <Smartphone size={14} />,  label: 'شورت'      },
    { key: 'playlists', icon: <Play size={14} />,        label: 'پلی‌لیست'  },
    { key: 'analytics', icon: <BarChart3 size={14} />,   label: 'آمار'      },
    { key: 'settings',  icon: <Settings size={14} />,    label: 'تنظیمات'   },
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
            className="relative flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0"
            style={{
              background: tab === t.key ? 'var(--primary)' : 'var(--surface)',
              color:      tab === t.key ? '#fff' : 'var(--label)',
            }}>
            {t.icon}{t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5"
                style={{ background: '#ef4444', color: '#fff' }}>
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'channels'  && <ChannelsTab />}
      {tab === 'queue'     && <QueueTab />}
      {tab === 'shorts'    && <ShortsTab />}
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
    onSuccess:  (d) => alert(`✅ ${Object.values(d.results || {}).reduce((a: any, r: any) => a + (r.queued || 0), 0)} ویدیو به صف اضافه شد`),
  });

  return (
    <div className="space-y-4">
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

      <button onClick={() => sync.mutate()} disabled={sync.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <RefreshCw size={16} className={sync.isPending ? 'animate-spin' : ''} />
        {sync.isPending ? 'در حال همگام‌سازی...' : 'همگام‌سازی همه کانال‌ها'}
      </button>

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
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: ch.enabled ? '#22c55e20' : '#ef444420', color: ch.enabled ? '#22c55e' : '#ef4444' }}>
                {ch.enabled ? 'فعال' : 'غیرفعال'}
              </span>
              {expanded === ch.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>

          {expanded === ch.id && (
            <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                {[
                  { k: 'enabled',       l: 'فعال'    },
                  { k: 'import_videos', l: 'ویدیوها' },
                  { k: 'import_shorts', l: 'شورت‌ها' },
                  { k: 'show_live',     l: 'لایو'     },
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
   SWIPEABLE QUEUE CARD
═══════════════════════════════════════════════════════════════ */
interface SwipeCardProps {
  item: any;
  onApprove: (item: any) => void;
  onReject:  (id: number) => void;
}

function SwipeCard({ item, onApprove, onReject }: SwipeCardProps) {
  const [dx, setDx] = useState(0);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title || '');
  const [editLang,  setEditLang]  = useState('fa');
  const startX = useRef(0);
  const isDragging = useRef(false);

  const threshold = 80;
  const ratio = Math.min(Math.abs(dx) / threshold, 1);
  const isRight = dx > 0;
  const isPast  = Math.abs(dx) >= threshold;

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    setDx(e.touches[0].clientX - startX.current);
  }

  function onTouchEnd() {
    isDragging.current = false;
    if (isPast && isRight)  { onApprove({ id: item.id }); return; }
    if (isPast && !isRight) { onReject(item.id); return; }
    setDx(0);
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const { data } = await api.post('/ai/generate', {
        action: 'summarize',
        content: item.title + (item.description ? '\n' + item.description.slice(0, 500) : ''),
        lang: 'fa',
      });
      setAiSummary(data.result || data.content || 'خلاصه‌ای یافت نشد');
    } catch {
      setAiSummary('خطا در تولید خلاصه');
    } finally {
      setSummaryLoading(false);
    }
  }

  const overlayOpacity = ratio * 0.7;
  const overlayColor   = isRight ? `rgba(34,197,94,${overlayOpacity})` : `rgba(239,68,68,${overlayOpacity})`;

  return (
    <div
      className="raha-card overflow-hidden select-none relative"
      style={{
        transform: `translateX(${dx}px) rotate(${dx * 0.02}deg)`,
        transition: isDragging.current ? 'none' : 'transform 0.3s ease',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Swipe overlay */}
      {Math.abs(dx) > 10 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 rounded-2xl"
          style={{ background: overlayColor }}>
          {isRight
            ? <Check size={40} color="#fff" strokeWidth={3} style={{ opacity: ratio }} />
            : <X     size={40} color="#fff" strokeWidth={3} style={{ opacity: ratio }} />
          }
        </div>
      )}

      <div className="p-3 space-y-2">
        <div className="flex gap-3">
          {item.thumbnail && (
            <img src={item.thumbnail} className="w-24 h-14 object-cover rounded-lg flex-shrink-0" alt="" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold line-clamp-2 leading-snug">{item.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs" style={{ color: 'var(--label)' }}>
                {item.type === 'short' ? '📱 شورت' : '🎬 ویدیو'}
              </span>
              {item.duration_sec > 0 && (
                <span className="text-xs ltr font-mono" style={{ color: 'var(--label)' }}>
                  {Math.floor(item.duration_sec / 60)}:{String(item.duration_sec % 60).padStart(2, '0')}
                </span>
              )}
              {item.published_at && (
                <span className="text-xs" style={{ color: 'var(--label)' }}>
                  {item.published_at.slice(0, 10)}
                </span>
              )}
            </div>

            {/* Flags */}
            <div className="flex gap-1 mt-1 flex-wrap">
              {item.is_duplicate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: '#f59e0b20', color: '#f59e0b' }}>تکراری</span>
              )}
              {item.toxicity_score > 50 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: '#ef444420', color: '#ef4444' }}>محتوای مشکل‌دار</span>
              )}
              {item.auto_flagged && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: '#8b5cf620', color: '#8b5cf6' }}>پرچم خودکار</span>
              )}
            </div>
          </div>
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="rounded-lg p-2 text-xs leading-relaxed" style={{ background: 'var(--bg)', color: 'var(--label)' }}>
            <span className="font-bold" style={{ color: 'var(--primary)' }}>خلاصه هوش مصنوعی: </span>
            {aiSummary}
          </div>
        )}

        {/* Edit mode */}
        {editMode ? (
          <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
              placeholder="عنوان سفارشی"
              className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
            <div className="flex gap-2">
              <select value={editLang} onChange={e => setEditLang(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <option value="fa">FA فارسی</option>
                <option value="en">EN English</option>
              </select>
              <button onClick={() => onApprove({ id: item.id, title: editTitle || undefined, lang: editLang })}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: '#22c55e', color: '#fff' }}>
                <Check size={14} />منتشر
              </button>
              <button onClick={() => setEditMode(false)}
                className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface)' }}>
                لغو
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5 pt-1">
            <a href={`https://youtu.be/${item.yt_id}`} target="_blank" rel="noreferrer"
              className="text-[10px] px-2 py-1.5 rounded-lg flex-shrink-0"
              style={{ background: 'var(--bg)', color: 'var(--label)' }}>
              ↗ YT
            </a>
            <button onClick={loadSummary} disabled={summaryLoading}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] flex-shrink-0"
              style={{ background: '#8b5cf620', color: '#8b5cf6', opacity: summaryLoading ? .6 : 1 }}>
              <Zap size={11} />{summaryLoading ? '...' : 'خلاصه'}
            </button>
            <button onClick={() => { setEditMode(true); }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: '#22c55e20', color: '#22c55e' }}>
              <Check size={13} />انتشار
            </button>
            <button onClick={() => { if (confirm('رد شود؟')) onReject(item.id); }}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: '#ef444420', color: '#ef4444' }}>
              <X size={13} />رد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   QUEUE TAB
═══════════════════════════════════════════════════════════════ */
function QueueTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useYT('/queue', { status, limit: 50 });
  const items: any[] = data?.items || [];
  const total: number = data?.total || 0;

  const filteredItems = useMemo(() =>
    search.trim()
      ? items.filter(i => i.title?.toLowerCase().includes(search.toLowerCase()))
      : items,
    [items, search]
  );

  const approve = useMutation({
    mutationFn: ({ id, title, lang }: { id: number; title?: string; lang?: string }) =>
      api.post(`/youtube/queue/${id}/approve`, { title, lang }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yt', '/queue'] }),
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

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--label)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="جستجو در عنوان..."
          className="w-full rounded-xl pr-9 pl-3 py-2.5 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        />
      </div>

      {isLoading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}
      {!isLoading && !filteredItems.length && (
        <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>
          {search ? 'نتیجه‌ای یافت نشد' : 'موردی نیست'}
        </p>
      )}

      {status === 'pending' && filteredItems.length > 0 && (
        <p className="text-[10px] text-center" style={{ color: 'var(--label)' }}>
          👆 برای تأیید به راست، برای رد به چپ بکشید
        </p>
      )}

      {status === 'pending'
        ? filteredItems.map((item: any) => (
            <SwipeCard
              key={item.id}
              item={item}
              onApprove={({ id, title, lang }) => approve.mutate({ id, title, lang })}
              onReject={id => reject.mutate(id)}
            />
          ))
        : filteredItems.map((item: any) => (
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
                    {item.published_at && (
                      <span className="text-xs" style={{ color: 'var(--label)' }}>{item.published_at.slice(0, 10)}</span>
                    )}
                  </div>
                  {status === 'approved' && item.post_id && (
                    <p className="text-xs mt-1" style={{ color: '#22c55e' }}>✓ پست #{item.post_id}</p>
                  )}
                </div>
              </div>
            </div>
          ))
      }
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SHORTS TAB
═══════════════════════════════════════════════════════════════ */
function ShortsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: pendingData, isLoading: pendingLoading } = useYT('/queue', { status: 'pending', type: 'short', limit: 50 });
  const { data: approvedData, isLoading: approvedLoading } = useYT('/queue', { status: 'approved', type: 'short', limit: 30 });

  const pending: any[]  = (pendingData?.items || []).filter((i: any) => i.type === 'short');
  const approved: any[] = (approvedData?.items || []).filter((i: any) => i.type === 'short');

  const approve = useMutation({
    mutationFn: ({ id, lang }: { id: number; lang: string }) =>
      api.post(`/youtube/queue/${id}/approve`, { lang }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yt'] }),
  });

  const reject = useMutation({
    mutationFn: (id: number) => api.post(`/youtube/queue/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yt'] }),
  });

  const allPending = search
    ? pending.filter(i => i.title?.toLowerCase().includes(search.toLowerCase()))
    : pending;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--label)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="جستجو در شورت‌ها..."
          className="w-full rounded-xl pr-9 pl-3 py-2.5 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="raha-card p-3 text-center">
          <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{pending.length}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--label)' }}>شورت در انتظار</p>
        </div>
        <div className="raha-card p-3 text-center">
          <p className="text-2xl font-bold" style={{ color: '#22c55e' }}>{approved.length}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--label)' }}>شورت منتشر</p>
        </div>
      </div>

      <p className="text-sm font-semibold">شورت‌های در انتظار ({allPending.length})</p>

      {(pendingLoading || approvedLoading) && (
        <p className="text-center text-sm py-4" style={{ color: 'var(--label)' }}>بارگذاری...</p>
      )}

      {/* Shorts grid */}
      <div className="grid grid-cols-2 gap-3">
        {allPending.map((item: any) => (
          <div key={item.id} className="raha-card overflow-hidden">
            {item.thumbnail && (
              <img src={item.thumbnail} className="w-full aspect-[9/16] object-cover" alt="" />
            )}
            <div className="p-2 space-y-2">
              <p className="text-xs font-semibold line-clamp-2 leading-snug">{item.title}</p>
              <div className="flex gap-1">
                <button onClick={() => approve.mutate({ id: item.id, lang: 'fa' })}
                  className="flex-1 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: '#22c55e20', color: '#22c55e' }}>
                  ✓
                </button>
                <button onClick={() => { if (confirm('رد شود؟')) reject.mutate(item.id); }}
                  className="flex-1 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: '#ef444420', color: '#ef4444' }}>
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!pendingLoading && allPending.length === 0 && (
        <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>
          {search ? 'نتیجه‌ای یافت نشد' : 'شورتی در انتظار تأیید نیست'}
        </p>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PLAYLISTS TAB
═══════════════════════════════════════════════════════════════ */
function PlaylistsTab() {
  const qc = useQueryClient();
  const { data: channels = [] } = useYT('/channels');
  const [selCh, setSelCh] = useState('');
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
      {!isLoading && !playlists.length && chId && (
        <p className="text-center text-sm py-4" style={{ color: 'var(--label)' }}>پلی‌لیستی یافت نشد</p>
      )}

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
   ANALYTICS TAB — Creator Intelligence Dashboard
═══════════════════════════════════════════════════════════════ */

const DOW_FA = ['', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه', 'یکشنبه'];
const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10 },
  labelStyle:   { color: 'var(--label)' },
};

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value > 0;
  const Icon = value === 0 ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: up ? '#22c55e20' : value === 0 ? 'var(--surface)' : '#ef444420',
               color: up ? '#22c55e' : value === 0 ? 'var(--label)' : '#ef4444' }}>
      <Icon size={10} />{Math.abs(value)}%
    </span>
  );
}

type AnalyticsSection = 'overview' | 'trends' | 'besttime' | 'formats' | 'playlists' | 'growth' | 'top' | 'report';

function AnalyticsTab() {
  const [section, setSection] = useState<AnalyticsSection>('overview');
  const [aiRec, setAiRec]     = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: advanced, isLoading: advLoading } = useQuery({
    queryKey: ['yt', 'analytics/advanced'],
    queryFn:  () => api.get('/youtube/analytics/advanced').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: trends = [], isLoading: trendsLoading } = useQuery({
    queryKey: ['yt', 'analytics/trends', 30],
    queryFn:  () => api.get('/youtube/analytics/trends', { params: { days: 30 } }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: bestTimes = [], isLoading: btLoading } = useQuery({
    queryKey: ['yt', 'analytics/best-times'],
    queryFn:  () => api.get('/youtube/analytics/best-times').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  });

  const { data: report } = useQuery({
    queryKey: ['yt', 'analytics/report'],
    queryFn:  () => api.get('/youtube/analytics/report').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const qc = useQueryClient();
  const snapshot = useMutation({
    mutationFn: () => api.post('/youtube/analytics/snapshot'),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['yt', 'analytics'] }); alert('✅ اسنپ‌شات ذخیره شد'); },
  });

  const summary    = advanced?.summary    || {};
  const comparison = advanced?.comparison || [];
  const top        = advanced?.top        || [];
  const playlists  = advanced?.playlists  || [];
  const growth     = advanced?.growth     || {};

  const trendData = useMemo(() =>
    (trends as any[]).map((d: any) => ({
      روز:     d.day?.slice(5),
      بازدید: parseInt(d.total_views  || 0),
      لایک:   parseInt(d.total_likes  || 0),
    })), [trends]);

  const growthHistory = useMemo(() => [
    ...(growth.history || []).map((w: any) => ({
      هفته: w.week_start?.slice(5),
      بازدید: parseInt(w.total_views || 0),
    })),
    ...(growth.forecast || []).map((w: any) => ({
      هفته:    w.week_start?.slice(5),
      پیش‌بینی: parseInt(w.predicted_views || 0),
    })),
  ], [growth]);

  // Best upload time — top 10 slots
  const topSlots = useMemo(() =>
    (bestTimes as any[]).slice(0, 10), [bestTimes]);

  // Format comparison for pie
  const formatPie = useMemo(() =>
    (comparison as any[]).map((c: any) => ({
      name: c.type === 'short' ? 'شورت' : 'ویدیو',
      value: parseInt(c.video_count || 0),
    })), [comparison]);

  const PIE_COLORS = ['var(--primary)', '#f59e0b'];

  async function getAiRecommendations() {
    setAiLoading(true);
    const prompt = `بر اساس این آمار کانال یوتیوب، ۵ توصیه هوشمند برای بهبود عملکرد بده:
- تعداد ویدیو: ${summary.total_videos || 0}
- میانگین بازدید: ${summary.avg_views || 0}
- نرخ لایک: ${summary.avg_like_rate || 0}%
- روند رشد: ${growth.trend || 'نامشخص'}
- بهترین ساعت آپلود: ${topSlots[0] ? DOW_FA[topSlots[0].dow] + ' ساعت ' + topSlots[0].hour : 'نامشخص'}
توصیه‌ها باید عملی، کوتاه و به فارسی باشند.`;

    try {
      const { data } = await api.post('/ai/generate', { action: 'summarize', content: prompt, lang: 'fa' });
      setAiRec(data.result || data.content || 'پاسخی دریافت نشد');
    } catch {
      setAiRec('خطا در اتصال به هوش مصنوعی');
    } finally {
      setAiLoading(false);
    }
  }

  const sections: { key: AnalyticsSection; label: string; icon: React.ReactNode }[] = [
    { key: 'overview',  label: 'خلاصه',    icon: <BarChart3 size={13} />    },
    { key: 'trends',    label: 'روند',      icon: <TrendingUp size={13} />   },
    { key: 'besttime',  label: 'بهترین وقت', icon: <Clock size={13} />       },
    { key: 'formats',   label: 'فرمت‌ها',   icon: <Play size={13} />         },
    { key: 'playlists', label: 'پلی‌لیست',  icon: <List size={13} />         },
    { key: 'growth',    label: 'رشد',       icon: <Target size={13} />       },
    { key: 'top',       label: 'برتر',      icon: <Award size={13} />        },
    { key: 'report',    label: 'گزارش',     icon: <FileText size={13} />     },
  ];

  const loading = advLoading || trendsLoading;

  return (
    <div className="space-y-4">
      {/* Section bar */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors"
            style={{
              background: section === s.key ? 'var(--primary)' : 'var(--surface)',
              color:      section === s.key ? '#fff' : 'var(--label)',
            }}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}

      {/* ── Overview ── */}
      {section === 'overview' && !loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'کل ویدیو',    value: summary.total_videos   || 0, color: 'var(--primary)' },
              { label: 'کل بازدید',   value: parseInt(summary.total_views  || 0).toLocaleString(), color: '#22c55e' },
              { label: 'میانگین بازدید', value: parseInt(summary.avg_views || 0).toLocaleString(), color: '#3b82f6' },
              { label: 'نرخ لایک',    value: (summary.avg_like_rate || 0) + '%', color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="raha-card p-3 text-center">
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--label)' }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Weekly deltas */}
          {report?.deltas && (
            <div className="raha-card p-3">
              <p className="text-xs font-semibold mb-2">تغییرات هفته جاری نسبت به هفته قبل</p>
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'بازدید', val: report.deltas.views },
                  { label: 'لایک',   val: report.deltas.likes },
                  { label: 'کامنت',  val: report.deltas.comments },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: 'var(--label)' }}>{label}</span>
                    <DeltaBadge value={val} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          <div className="raha-card p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Zap size={13} style={{ color: 'var(--primary)' }} />
                توصیه‌های هوش مصنوعی
              </p>
              <button onClick={getAiRecommendations} disabled={aiLoading}
                className="text-[10px] px-2 py-1 rounded-lg font-bold"
                style={{ background: 'var(--primary)', color: '#fff', opacity: aiLoading ? .6 : 1 }}>
                {aiLoading ? 'درحال تحلیل...' : aiRec ? 'به‌روزرسانی' : 'دریافت توصیه'}
              </button>
            </div>
            {aiRec
              ? <p className="text-xs leading-relaxed" style={{ color: 'var(--label)' }}>{aiRec}</p>
              : <p className="text-[10px]" style={{ color: 'var(--label)' }}>روی «دریافت توصیه» کلیک کنید</p>
            }
          </div>

          {/* Snapshot trigger */}
          <button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}
            className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <RefreshCw size={13} className={snapshot.isPending ? 'animate-spin' : ''} />
            {snapshot.isPending ? 'در حال ذخیره آمار...' : 'ذخیره آمار امروز'}
          </button>
        </div>
      )}

      {/* ── Trends (30-day area chart) ── */}
      {section === 'trends' && !trendsLoading && (
        <div className="space-y-3">
          <div className="raha-card p-3">
            <p className="text-xs font-semibold mb-3">روند بازدید ۳۰ روز اخیر</p>
            {trendData.length > 0
              ? <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={trendData} margin={{ right: 4, left: -20 }}>
                    <defs>
                      <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--primary)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="روز" tick={{ fontSize: 9, fill: 'var(--label)' }} interval={4} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--label)' }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="بازدید" stroke="var(--primary)" fill="url(#gv)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              : <p className="text-xs text-center py-4" style={{ color: 'var(--label)' }}>
                  داده‌ای برای نمایش وجود ندارد. ابتدا آمار روز را ذخیره کنید.
                </p>
            }
          </div>

          {trendData.length > 0 && (
            <div className="raha-card p-3">
              <p className="text-xs font-semibold mb-3">روند لایک</p>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={trendData} margin={{ right: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="روز" tick={{ fontSize: 9, fill: 'var(--label)' }} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--label)' }} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="لایک" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Best Upload Time heatmap ── */}
      {section === 'besttime' && !btLoading && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--label)' }}>بهترین روز و ساعت برای آپلود بر اساس میانگین بازدید</p>
          {topSlots.length > 0 ? (
            <>
              <div className="space-y-2">
                {topSlots.map((slot: any, i: number) => {
                  const maxViews = topSlots[0]?.avg_views || 1;
                  const pct = Math.round((slot.avg_views / maxViews) * 100);
                  return (
                    <div key={i} className="raha-card p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold">
                          {DOW_FA[slot.dow]} — ساعت {slot.hour}:۰۰
                        </span>
                        <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                          {parseInt(slot.avg_views).toLocaleString()} بازدید
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--label)' }}>
                        {slot.count} ویدیو آپلود شده در این بازه
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="raha-card p-3">
                <p className="text-xs font-semibold mb-1">📌 توصیه</p>
                <p className="text-xs" style={{ color: 'var(--label)' }}>
                  بهترین زمان آپلود: <strong style={{ color: 'var(--primary)' }}>
                    {DOW_FA[topSlots[0]?.dow]} ساعت {topSlots[0]?.hour}:۰۰
                  </strong>
                </p>
              </div>
            </>
          ) : (
            <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>
              داده‌ای برای تحلیل وجود ندارد
            </p>
          )}
        </div>
      )}

      {/* ── Format Comparison ── */}
      {section === 'formats' && !loading && (
        <div className="space-y-3">
          {formatPie.length > 0 && (
            <div className="raha-card p-3">
              <p className="text-xs font-semibold mb-2">توزیع محتوا</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={formatPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                    {formatPie.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {(comparison as any[]).map((c: any) => (
            <div key={c.type} className="raha-card p-3">
              <p className="text-sm font-bold mb-2">{c.type === 'short' ? '📱 شورت' : '🎬 ویدیوی عادی'}</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'تعداد', value: c.video_count },
                  { label: 'میانگین بازدید', value: parseInt(c.avg_views || 0).toLocaleString() },
                  { label: 'میانگین لایک',   value: parseInt(c.avg_likes || 0).toLocaleString() },
                  { label: 'نرخ لایک',        value: (c.avg_like_rate || 0) + '%' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg p-2 text-center" style={{ background: 'var(--bg)' }}>
                    <p className="text-sm font-bold">{value}</p>
                    <p className="text-[10px]" style={{ color: 'var(--label)' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {comparison.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>داده‌ای موجود نیست</p>
          )}
        </div>
      )}

      {/* ── Playlist Performance ── */}
      {section === 'playlists' && !loading && (
        <div className="space-y-3">
          {playlists.length === 0
            ? <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>پلی‌لیستی یافت نشد</p>
            : (
              <>
                {/* Bar chart */}
                <div className="raha-card p-3">
                  <p className="text-xs font-semibold mb-3">بازدید پلی‌لیست‌ها</p>
                  <ResponsiveContainer width="100%" height={Math.max(120, playlists.length * 28)}>
                    <BarChart data={(playlists as any[]).slice(0, 8).map((p: any) => ({ name: p.name?.slice(0, 10), بازدید: parseInt(p.total_views || 0) }))} layout="vertical" margin={{ right: 8, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--label)' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--label)' }} width={70} />
                      <Tooltip {...CHART_TOOLTIP_STYLE} />
                      <Bar dataKey="بازدید" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {(playlists as any[]).map((pl: any) => (
                  <div key={pl.playlist_id} className="raha-card p-3">
                    <p className="text-sm font-semibold mb-2">{pl.name}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg p-2" style={{ background: 'var(--bg)' }}>
                        <p className="text-sm font-bold">{pl.video_count}</p>
                        <p className="text-[10px]" style={{ color: 'var(--label)' }}>ویدیو</p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: 'var(--bg)' }}>
                        <p className="text-sm font-bold">{parseInt(pl.total_views || 0).toLocaleString()}</p>
                        <p className="text-[10px]" style={{ color: 'var(--label)' }}>بازدید</p>
                      </div>
                      <div className="rounded-lg p-2" style={{ background: 'var(--bg)' }}>
                        <p className="text-sm font-bold">{pl.avg_like_rate || 0}%</p>
                        <p className="text-[10px]" style={{ color: 'var(--label)' }}>نرخ لایک</p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
        </div>
      )}

      {/* ── Growth Prediction ── */}
      {section === 'growth' && !loading && (
        <div className="space-y-3">
          <div className="raha-card p-3">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">پیش‌بینی رشد ۴ هفته آینده</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                style={{
                  background: growth.trend === 'growing' ? '#22c55e20' : growth.trend === 'declining' ? '#ef444420' : 'var(--surface)',
                  color:      growth.trend === 'growing' ? '#22c55e'   : growth.trend === 'declining' ? '#ef4444'   : 'var(--label)',
                }}>
                {growth.trend === 'growing' ? '↑ رو به رشد' : growth.trend === 'declining' ? '↓ رو به کاهش' : '→ ثابت'}
              </span>
            </div>
            {growthHistory.length > 0
              ? <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={growthHistory} margin={{ right: 4, left: -20 }}>
                    <defs>
                      <linearGradient id="gh" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="هفته" tick={{ fontSize: 9, fill: 'var(--label)' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--label)' }} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="بازدید"    stroke="#22c55e" fill="url(#gh)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="پیش‌بینی" stroke="#f59e0b" fill="url(#gf)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              : <p className="text-xs text-center py-4" style={{ color: 'var(--label)' }}>
                  داده تاریخی کافی وجود ندارد (حداقل ۲ هفته اسنپ‌شات لازم است)
                </p>
            }
          </div>
        </div>
      )}

      {/* ── Top Performers ── */}
      {section === 'top' && !loading && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--label)' }}>۱۰ ویدیوی پربازدیدترین</p>
          {top.length === 0
            ? <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>داده‌ای موجود نیست</p>
            : (top as any[]).map((v: any, i: number) => (
                <div key={v.yt_id} className="raha-card p-3 flex gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                    style={{ background: i < 3 ? '#f59e0b' : 'var(--surface)', color: i < 3 ? '#fff' : 'var(--label)' }}>
                    {i + 1}
                  </div>
                  {v.thumbnail && <img src={v.thumbnail} className="w-20 h-12 object-cover rounded-lg flex-shrink-0" alt="" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold line-clamp-2 leading-snug">{v.title}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-[10px]" style={{ color: '#22c55e' }}>👁 {parseInt(v.peak_views || 0).toLocaleString()}</span>
                      <span className="text-[10px]" style={{ color: '#3b82f6' }}>👍 {parseInt(v.peak_likes || 0).toLocaleString()}</span>
                      <span className="text-[10px]" style={{ color: 'var(--label)' }}>{v.like_rate || 0}%</span>
                    </div>
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* ── Weekly Report ── */}
      {section === 'report' && (
        <div className="space-y-3">
          {!report
            ? <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>در حال بارگذاری...</p>
            : (
              <>
                <div className="raha-card p-4">
                  <p className="text-sm font-bold mb-3">📊 گزارش هفتگی کانال</p>
                  <p className="text-[10px] mb-3" style={{ color: 'var(--label)' }}>تولید شده: {report.generated_at}</p>

                  <div className="space-y-3">
                    {[
                      { label: 'بازدید', this: report.this_week?.views || 0, last: report.last_week?.views || 0, delta: report.deltas?.views },
                      { label: 'لایک',   this: report.this_week?.likes || 0, last: report.last_week?.likes || 0, delta: report.deltas?.likes },
                      { label: 'کامنت',  this: report.this_week?.comments || 0, last: report.last_week?.comments || 0, delta: report.deltas?.comments },
                    ].map(({ label, this: tw, last: lw, delta }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs">{label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{parseInt(String(tw)).toLocaleString()}</span>
                            <DeltaBadge value={delta} />
                          </div>
                        </div>
                        <div className="flex gap-2 text-[10px]" style={{ color: 'var(--label)' }}>
                          <span>این هفته: {parseInt(String(tw)).toLocaleString()}</span>
                          <span>·</span>
                          <span>هفته قبل: {parseInt(String(lw)).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={getAiRecommendations} disabled={aiLoading}
                  className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: 'var(--primary)', color: '#fff', opacity: aiLoading ? .6 : 1 }}>
                  <Zap size={15} />
                  {aiLoading ? 'در حال تحلیل هوش مصنوعی...' : 'تحلیل هوشمند گزارش'}
                </button>

                {aiRec && (
                  <div className="raha-card p-3">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--primary)' }}>توصیه‌های هوش مصنوعی</p>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--label)' }}>{aiRec}</p>
                  </div>
                )}
              </>
            )}
        </div>
      )}
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
  const [activeSection, setActiveSection] = useState<'sync' | 'notifications' | 'users'>('sync');

  // Users management
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => api.get('/users').then(r => r.data),
  });

  const save = useMutation({
    mutationFn: () => api.patch('/youtube/settings', {
      ...(apiKey ? { api_key: apiKey } : {}),
      sync_interval: interval,
    }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['yt', '/settings'] }); alert('✅ ذخیره شد'); setApiKey(''); },
  });

  const sync = useMutation({
    mutationFn: () => api.post('/youtube/sync').then(r => r.data),
    onSuccess: () => alert('✅ همگام‌سازی انجام شد'),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) => api.patch(`/users/${id}/role`, { role }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const sections = [
    { key: 'sync' as const,          icon: <RefreshCw size={14} />, label: 'همگام‌سازی' },
    { key: 'notifications' as const, icon: <Bell size={14} />,      label: 'اعلان‌ها'   },
    { key: 'users' as const,         icon: <Users size={14} />,     label: 'کاربران'    },
  ];

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-2">
        {sections.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium"
            style={{
              background: activeSection === s.key ? 'var(--primary)' : 'var(--surface)',
              color:      activeSection === s.key ? '#fff' : 'var(--label)',
            }}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {/* Sync section */}
      {activeSection === 'sync' && (
        <>
          <div className="raha-card p-4 space-y-3">
            <p className="text-sm font-semibold">YouTube Data API v3</p>
            <p className="text-xs" style={{ color: 'var(--label)' }}>
              وضعیت: <span style={{ color: cfg?.api_key ? '#22c55e' : '#ef4444' }}>
                {cfg?.api_key ? '✓ تنظیم شده' : '✗ تنظیم نشده'}
              </span>
            </p>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="AIza... (فقط برای تغییر)"
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
        </>
      )}

      {/* Notifications section */}
      {activeSection === 'notifications' && (
        <div className="space-y-3">
          <div className="raha-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <Bell size={18} style={{ color: 'var(--primary)' }} />
              <p className="text-sm font-semibold">اعلان‌های تلگرام</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--label)' }}>
              اعلان‌های خودکار از طریق بات تلگرام ارسال می‌شوند.
              برای دریافت اعلان، Telegram Chat ID خود را در تنظیمات وردپرس وارد کنید.
            </p>
          </div>

          <div className="raha-card p-4 space-y-2">
            <p className="text-sm font-semibold mb-2">انواع اعلان</p>
            {[
              { label: 'ویدیوی جدید در صف', hint: 'هر بار که ویدیو وارد صف می‌شود' },
              { label: 'تأیید/رد دسته‌ای', hint: 'نتیجه عملیات دسته‌ای' },
              { label: 'اعمال قانون خودکار', hint: 'وقتی قانون روی ویدیو اعمال می‌شود' },
            ].map(({ label, hint }) => (
              <div key={label} className="flex items-start gap-2 py-1.5">
                <span className="text-[10px] mt-0.5" style={{ color: '#22c55e' }}>✓</span>
                <div>
                  <p className="text-xs font-medium">{label}</p>
                  <p className="text-[10px]" style={{ color: 'var(--label)' }}>{hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users section */}
      {activeSection === 'users' && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--label)' }}>مدیریت نقش کاربران</p>
          {(users as any[]).map((u: any) => (
            <div key={u.id} className="raha-card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'var(--primary)', color: '#fff' }}>
                {(u.display_name || u.username || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.display_name || u.username}</p>
                <p className="text-xs truncate" style={{ color: 'var(--label)' }}>{u.email}</p>
              </div>
              <select
                defaultValue={u.role}
                onChange={e => changeRole.mutate({ id: u.id, role: e.target.value })}
                className="rounded-lg px-2 py-1 text-xs flex-shrink-0"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: u.role === 'admin' ? 'var(--primary)' : 'var(--label)',
                }}>
                <option value="admin">ادمین</option>
                <option value="editor">ویراستار</option>
              </select>
            </div>
          ))}
          {!users.length && (
            <p className="text-center text-sm py-4" style={{ color: 'var(--label)' }}>کاربری یافت نشد</p>
          )}
        </div>
      )}
    </div>
  );
}
