import {
  CheckCircle, Clock, FileText, Sparkles, Plus,
  Image as ImageIcon, FolderTree, Cpu, ChevronLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useStats, useQuota } from '../hooks/useQueries';
import ThemeToggle from '../components/ui/ThemeToggle';

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: quota, isLoading: quotaLoading } = useQuota();

  const quotaPct = quota ? (quota.used / quota.total) * 100 : 0;
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ - (quotaPct / 100) * circ;

  return (
    <div className="px-4 pt-5 pb-28" dir="rtl">
      {/* ── Brand bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="raha-brand text-3xl leading-none">RAHA</h1>
          <p className="text-label text-[11px] mt-1">مرکز فرماندهی محتوا</p>
        </div>
        <ThemeToggle />
      </div>

      {/* ── User pill ─────────────────────────────────────────────── */}
      <div className="raha-card mb-5 flex items-center gap-3 p-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-base flex-shrink-0"
          style={{ background: 'var(--grad-primary)' }}
        >
          {user?.displayName?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label text-[10px]">خوش آمدید</p>
          <p className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>
            {user?.displayName || user?.username}
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full font-medium"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {user?.role === 'admin' ? '⚡ مدیر' : 'ویرایشگر'}
        </span>
      </div>

      {/* ── AI Quota Hero Card ───────────────────────────────────── */}
      <div className="raha-card raha-card-lifted mb-5 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu size={16} style={{ color: 'var(--primary)' }} />
            <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>هوش مصنوعی</h3>
          </div>
          <button onClick={() => navigate('/settings')}
            className="text-[11px] flex items-center gap-1"
            style={{ color: 'var(--primary)' }}>
            افزودن کلید
            <ChevronLeft size={12} />
          </button>
        </div>

        <div className="flex items-center gap-5">
          {quotaLoading ? (
            <div className="w-28 h-28 flex-shrink-0 rounded-full bg-border animate-pulse" />
          ) : (
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
                <circle
                  cx="64" cy="64" r={r} fill="none"
                  stroke="var(--primary)" strokeWidth="10"
                  strokeDasharray={circ}
                  strokeDashoffset={dash}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                <span className="font-extrabold text-lg" style={{ color: 'var(--text)' }}>
                  {quota?.used ?? '-'}/{quota?.total ?? '-'}
                </span>
                <span className="text-label text-[9px]">روزانه</span>
              </div>
            </div>
          )}
          <div className="flex-1">
            <p className="text-2xl font-extrabold mb-1" style={{ color: 'var(--text)' }}>
              {quota?.remaining ?? '-'}
            </p>
            <p className="text-label text-xs leading-relaxed">
              درخواست باقی‌مانده برای امروز
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ────────────────────────────────────────────── */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="raha-card h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard tone="success" icon={<CheckCircle size={18} />} label="منتشر شده" value={stats?.approved} />
          <StatCard tone="warning" icon={<Clock size={18} />}       label="در انتظار" value={stats?.pending} />
          <StatCard tone="primary" icon={<FileText size={18} />}    label="کل محتوا"  value={stats?.total} />
          <StatCard tone="accent"  icon={<Sparkles size={18} />}    label="AI امروز"  value={stats?.aiToday} />
        </div>
      )}

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>دسترسی سریع</h3>
      </div>

      <ActionRow icon={<Plus size={20} />} label="محتوای جدید" primary
        onClick={() => navigate('/create')} />
      <ActionRow icon={<FileText size={18} />} label="پست‌های سایت"
        onClick={() => navigate('/wp-posts')} />
      <ActionRow icon={<ImageIcon size={18} />} label="کتابخانه مدیا"
        onClick={() => navigate('/media')} />
      <ActionRow icon={<FolderTree size={18} />} label="دسته‌بندی‌ها"
        onClick={() => navigate('/categories')} />
      <ActionRow icon={<Cpu size={18} />} label="تنظیمات AI"
        onClick={() => navigate('/settings')} />

      {/* ── FAB ───────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/create')}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-10"
        style={{
          background: 'var(--grad-primary)',
          boxShadow: '0 10px 30px rgba(79,184,180,0.45), 0 4px 8px rgba(0,0,0,0.3)',
        }}
      >
        <Plus size={26} color="#fff" />
      </button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function StatCard({
  tone, icon, label, value,
}: { tone: 'primary' | 'accent' | 'success' | 'warning'; icon: React.ReactNode; label: string; value?: number }) {
  return (
    <div className="raha-card raha-card-hover p-4">
      <div className="raha-stat-icon mb-3" data-tone={tone}>
        {icon}
      </div>
      <p className="text-2xl font-extrabold mb-0.5" style={{ color: 'var(--text)' }}>
        {value ?? '—'}
      </p>
      <p className="text-label text-xs">{label}</p>
    </div>
  );
}

function ActionRow({
  icon, label, primary = false, onClick,
}: { icon: React.ReactNode; label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="raha-card raha-card-hover w-full mb-2.5 p-4 flex items-center gap-3 text-right"
      style={primary ? { background: 'var(--grad-primary)', borderColor: 'transparent' } : undefined}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={
          primary
            ? { background: 'rgba(255,255,255,0.2)', color: '#fff' }
            : { background: 'var(--primary-soft)', color: 'var(--primary)' }
        }
      >
        {icon}
      </span>
      <span
        className="flex-1 font-bold text-sm"
        style={{ color: primary ? '#fff' : 'var(--text)' }}
      >
        {label}
      </span>
      <ChevronLeft size={16} style={{ color: primary ? 'rgba(255,255,255,0.7)' : 'var(--label)' }} />
    </button>
  );
}
