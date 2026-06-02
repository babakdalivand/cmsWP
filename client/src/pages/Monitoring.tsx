import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, AlertCircle, Info, CheckCircle, DatabaseBackup, Loader2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface LogEntry { id: number; level: string; source: string; message: string; created_at: string; }
interface AIStat { provider: string; requests: number; date: string; }

function LogIcon({ level }: { level: string }) {
  if (level === 'error') return <AlertCircle size={14} className="text-danger flex-shrink-0" />;
  if (level === 'warn')  return <AlertCircle size={14} className="text-warning flex-shrink-0" />;
  return <Info size={14} className="text-blue flex-shrink-0" />;
}

export default function Monitoring() {
  const user = useAuthStore((s) => s.user);
  const [logs, setLogs]             = useState<LogEntry[]>([]);
  const [aiStats, setAiStats]       = useState<AIStat[]>([]);
  const [filter, setFilter]         = useState('all');
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get('/monitoring/logs', { params: { limit: 50 } }).then(r => setLogs(r.data)).catch(() => {});
    api.get('/monitoring/ai-stats').then(r => setAiStats(r.data)).catch(() => {});
  }, []);

  async function handleBackup() {
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      await api.post('/admin/backup');
      setBackupMsg({ ok: true, text: 'پشتیبان‌گیری آغاز شد — فایل به تلگرام ارسال می‌شود' });
    } catch {
      setBackupMsg({ ok: false, text: 'خطا در اجرای پشتیبان‌گیری' });
    } finally {
      setBackupLoading(false);
    }
  }

  const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  const chartData = aiStats.reduce<Record<string, any>>((acc, s) => {
    const d = s.date?.slice(5);
    if (!acc[d]) acc[d] = { date: d };
    acc[d][s.provider] = (acc[d][s.provider] || 0) + Number(s.requests);
    return acc;
  }, {});
  const chart = Object.values(chartData).slice(-7);

  const COLORS = ['#0066FF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA'];
  const providers = [...new Set(aiStats.map(s => s.provider))];

  return (
    <div className="p-4 pb-28" dir="rtl">
      <h1 className="text-white font-bold text-xl mb-5">نظارت بر سیستم</h1>

      {/* ── Backup card (admin only) ─────────────────────────────── */}
      {user?.role === 'admin' && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DatabaseBackup size={16} style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>پشتیبان‌گیری دیتابیس</span>
            </div>
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-60"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              {backupLoading
                ? <><Loader2 size={12} className="animate-spin" /> در حال اجرا...</>
                : <><DatabaseBackup size={12} /> گرفتن پشتیبان</>
              }
            </button>
          </div>
          {backupMsg && (
            <p className={`text-xs mt-2 ${backupMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {backupMsg.text}
            </p>
          )}
          <p className="text-label text-[11px] mt-1">هر شب ساعت ۳ صبح به صورت خودکار اجرا می‌شود</p>
        </div>
      )}

      {/* AI Usage Chart */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm flex items-center gap-2">
            <Activity size={16} className="text-blue" /> استفاده از AI (۷ روز)
          </h3>
          <div className="flex gap-2">
            {providers.map((p, i) => (
              <span key={p} className="text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS[i] + '22', color: COLORS[i] }}>{p}</span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chart}>
            <XAxis dataKey="date" tick={{ fill: '#8E8E93', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: '#161618', border: '1px solid #1E1E21', borderRadius: 8, color: '#fff' }} />
            {providers.map((p, i) => (
              <Area key={p} type="monotone" dataKey={p} stroke={COLORS[i]} fill={COLORS[i] + '22'} strokeWidth={2} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Logs */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-medium text-sm">لاگ‌های سیستم</h3>
          <div className="flex gap-1">
            {['all', 'error', 'warn', 'info'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded-lg transition-colors ${filter === f ? 'bg-blue text-white' : 'text-label hover:text-white'}`}>
                {f === 'all' ? 'همه' : f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-label text-sm text-center py-6">لاگی یافت نشد</p>
          )}
          {filtered.map(log => (
            <div key={log.id} className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
              <LogIcon level={log.level} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono ${log.level === 'error' ? 'text-danger' : log.level === 'warn' ? 'text-warning' : 'text-success'}`}>
                    {new Date(log.created_at).toLocaleTimeString('fa-IR')}
                  </span>
                  <span className="text-label text-xs">[{log.source}]</span>
                </div>
                <p className="text-white text-xs truncate">{log.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
