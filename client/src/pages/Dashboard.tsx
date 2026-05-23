import { CheckCircle, Clock, FileText, Sparkles, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useStats, useQuota } from '../hooks/useQueries';
import ThemeToggle from '../components/ui/ThemeToggle';
import SoftCard from '../components/ui/SoftCard';

export default function Dashboard() {
  const user     = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: quota, isLoading: quotaLoading } = useQuota();

  const quotaPct = quota ? (quota.used / quota.total) * 100 : 0;
  const r    = 54;
  const circ = 2 * Math.PI * r;
  const dash = circ - (quotaPct / 100) * circ;

  return (
    <div className="p-5 pb-28" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue/20 border border-blue/30 flex items-center justify-center text-blue font-bold text-lg">
            {user?.displayName?.charAt(0) || 'U'}
          </div>
          <div>
            <p className="text-label text-xs">خوش آمدید</p>
            <h2 className="text-text font-bold text-lg">{user?.displayName || user?.username}</h2>
            <p className="text-label text-xs">{user?.role === 'admin' ? 'مدیر سیستم' : 'ویرایشگر'}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* AI Quota Ring */}
      <SoftCard padding="lg" className="mb-4 flex items-center gap-5">
        {quotaLoading ? (
          <div className="w-32 h-32 flex-shrink-0 rounded-full bg-border animate-pulse" />
        ) : (
          <div className="relative w-32 h-32 flex-shrink-0">
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
              <Sparkles size={16} className="text-blue mb-1" />
              <span className="text-text font-bold text-lg">{quota?.used ?? '-'}/{quota?.total ?? '-'}</span>
              <span className="text-label text-xs">روزانه</span>
            </div>
          </div>
        )}
        <div>
          <h3 className="text-text font-semibold mb-1">سهمیه AI امروز</h3>
          <p className="text-label text-sm">{quota?.remaining ?? '-'} درخواست باقی‌مانده</p>
          <p className="text-xs text-blue mt-2 cursor-pointer" onClick={() => navigate('/settings')}>
            افزودن کلید شخصی ←
          </p>
        </div>
      </SoftCard>

      {/* Stats Grid */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StatCard icon={<CheckCircle size={22} className="text-success" />} label="منتشر شده"     value={stats?.approved} color="text-success" />
          <StatCard icon={<Clock size={22} className="text-warning" />}       label="در انتظار تأیید" value={stats?.pending}  color="text-warning" />
          <StatCard icon={<FileText size={22} className="text-blue" />}       label="کل محتوا"       value={stats?.total}    color="text-blue" />
          <StatCard icon={<Sparkles size={22} className="text-purple-400" />} label="AI امروز"       value={stats?.aiToday}  color="text-purple-400" />
        </div>
      )}

      {/* Quick Actions */}
      <h3 className="text-text font-semibold mb-3">دسترسی سریع</h3>
      <div className="grid grid-cols-2 gap-3">
        <ActionBtn label="محتوای جدید"   icon="✏️" onClick={() => navigate('/create')}   primary />
        <ActionBtn label="پست‌های سایت"   icon="📋" onClick={() => navigate('/wp-posts')} />
        <ActionBtn label="کتابخانه مدیا" icon="🖼️" onClick={() => navigate('/media')} />
        <ActionBtn label="دسته‌بندی‌ها"  icon="📂" onClick={() => navigate('/categories')} />
        <ActionBtn label="تنظیمات AI"    icon="🤖" onClick={() => navigate('/settings')} />
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/create')}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-14 h-14 bg-blue rounded-full shadow-lg shadow-blue/40 flex items-center justify-center hover:bg-blue-hover transition-colors z-10"
      >
        <Plus size={26} className="text-white" />
      </button>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value?: number; color: string }) {
  return (
    <SoftCard padding="md" className="flex flex-col gap-2">
      {icon}
      <span className={`text-2xl font-bold ${color}`}>{value ?? '—'}</span>
      <span className="text-label text-xs">{label}</span>
    </SoftCard>
  );
}

function ActionBtn({ label, icon, onClick, primary }: { label: string; icon: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-4 flex items-center gap-3 font-medium text-sm transition-all shadow-soft hover:scale-[1.02] active:scale-[0.98] ${
        primary
          ? 'bg-blue/15 border border-blue/30 text-blue'
          : 'bg-surface text-text'
      }`}
    >
      <span className="text-xl">{icon}</span>
      {label}
    </button>
  );
}
