import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Crown, Users, CreditCard, TrendingUp, Check, X, Gift, RefreshCw, BarChart2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

const LEVEL_COLOR: Record<string, string> = {
  free:    '#6b7280',
  basic:   '#3b82f6',
  premium: '#f59e0b',
  vip:     '#a855f7',
};

const LEVEL_ICON: Record<string, string> = {
  free:    '🆓',
  basic:   '⭐',
  premium: '💎',
  vip:     '👑',
};

type Section = 'overview' | 'plans' | 'members' | 'transactions';

export default function Membership() {
  const [section, setSection] = useState<Section>('overview');
  const isAdmin = useAuthStore(s => s.isAdmin());

  return (
    <div className="px-4 pt-5 pb-28" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--primary)' }}>
          <Crown size={20} color="#fff" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none">اشتراک‌های ویژه</h1>
          <p className="text-xs" style={{ color: 'var(--label)' }}>مدیریت سطوح دسترسی و پرداخت‌ها</p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {[
          { key: 'overview' as Section,     icon: <BarChart2 size={13} />, label: 'خلاصه'      },
          { key: 'plans' as Section,        icon: <Crown size={13} />,    label: 'طرح‌ها'      },
          ...(isAdmin ? [
            { key: 'members' as Section,      icon: <Users size={13} />,    label: 'اعضا'       },
            { key: 'transactions' as Section, icon: <CreditCard size={13} />,label: 'تراکنش‌ها' },
          ] : []),
        ].map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0"
            style={{
              background: section === s.key ? 'var(--primary)' : 'var(--surface)',
              color:      section === s.key ? '#fff' : 'var(--label)',
            }}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {section === 'overview'     && <OverviewSection isAdmin={isAdmin} />}
      {section === 'plans'        && <PlansSection />}
      {section === 'members'      && isAdmin && <MembersSection />}
      {section === 'transactions' && isAdmin && <TransactionsSection />}
    </div>
  );
}

/* ── Overview ──────────────────────────────────────────────────── */
function OverviewSection({ isAdmin }: { isAdmin: boolean }) {
  const { data: my } = useQuery({
    queryKey: ['membership', 'my'],
    queryFn:  () => api.get('/membership/my').then(r => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['membership', 'stats'],
    queryFn:  () => api.get('/membership/admin/stats').then(r => r.data),
    enabled:  isAdmin,
  });

  const level = my?.level || 'free';

  return (
    <div className="space-y-4">
      {/* User's current level */}
      <div className="raha-card p-4"
        style={{ border: `2px solid ${LEVEL_COLOR[level]}30`, background: `${LEVEL_COLOR[level]}08` }}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{LEVEL_ICON[level]}</span>
          <div>
            <p className="text-sm" style={{ color: 'var(--label)' }}>سطح اشتراک شما</p>
            <p className="text-xl font-bold" style={{ color: LEVEL_COLOR[level] }}>
              {my?.levels?.[level]?.label || level}
            </p>
          </div>
        </div>

        {my?.subscription && (
          <div className="mt-3 pt-3 border-t space-y-1 text-xs" style={{ borderColor: 'var(--border)' }}>
            {my.subscription.expires_at && (
              <p style={{ color: 'var(--label)' }}>
                انقضا: <strong style={{ color: '#f59e0b' }}>{my.subscription.expires_at.slice(0, 10)}</strong>
              </p>
            )}
            <p style={{ color: 'var(--label)' }}>
              روش پرداخت: <strong>{my.subscription.gateway === 'manual' ? 'دستی' : my.subscription.gateway}</strong>
            </p>
          </div>
        )}

        {level === 'free' && (
          <p className="mt-3 text-xs" style={{ color: 'var(--label)' }}>
            با ارتقا به اشتراک ویژه، به محتوای انحصاری دسترسی پیدا کنید.
          </p>
        )}
      </div>

      {/* Admin stats */}
      {isAdmin && stats && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">آمار کلی اشتراک‌ها</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'فعال',    value: stats.active,    color: '#22c55e' },
              { label: 'منقضی',   value: stats.expired,   color: '#f59e0b' },
              { label: 'لغو شده', value: stats.cancelled, color: '#ef4444' },
            ].map(({ label, value, color }) => (
              <div key={label} className="raha-card p-3 text-center">
                <p className="text-xl font-bold" style={{ color }}>{value || 0}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--label)' }}>{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'اشتراک ویژه', value: stats.premium_count || 0, color: '#f59e0b' },
              { label: 'اشتراک VIP',  value: stats.vip_count || 0,     color: '#a855f7' },
            ].map(({ label, value, color }) => (
              <div key={label} className="raha-card p-3 text-center">
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--label)' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Plans ─────────────────────────────────────────────────────── */
function PlansSection() {
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['membership', 'plans'],
    queryFn:  () => api.get('/membership/plans').then(r => r.data),
  });

  const [gateway, setGateway] = useState<'zarinpal' | 'stripe'>('zarinpal');
  const [paying, setPaying]   = useState<string | null>(null);

  async function subscribe(plan: any) {
    setPaying(plan.id);
    try {
      const { data } = await api.post('/membership/pay/start', {
        plan_id: plan.id,
        gateway,
      });
      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank');
      }
    } catch (e: any) {
      alert(e.response?.data?.error || 'خطا در شروع پرداخت');
    } finally {
      setPaying(null);
    }
  }

  if (isLoading) return <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>;

  return (
    <div className="space-y-4">
      {/* Gateway selector */}
      <div className="raha-card p-3">
        <p className="text-xs mb-2 font-semibold">روش پرداخت</p>
        <div className="flex gap-2">
          {[
            { id: 'zarinpal' as const, label: '🇮🇷 زرین‌پال' },
            { id: 'stripe'   as const, label: '💳 Stripe'    },
          ].map(g => (
            <button key={g.id} onClick={() => setGateway(g.id)}
              className="flex-1 py-2 rounded-xl text-xs font-bold"
              style={{
                background: gateway === g.id ? 'var(--primary)' : 'var(--surface)',
                color:      gateway === g.id ? '#fff' : 'var(--label)',
              }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      {(plans as any[]).map((plan: any) => {
        const color = LEVEL_COLOR[plan.level] || 'var(--primary)';
        return (
          <div key={plan.id} className="raha-card p-4 overflow-hidden relative"
            style={{ border: `2px solid ${color}30` }}>
            <div className="absolute top-0 left-0 right-0 h-1" style={{ background: color }} />

            <div className="flex items-start justify-between mb-3 mt-1">
              <div>
                <p className="font-bold text-sm">{plan.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--label)' }}>{plan.duration_days} روزه</p>
              </div>
              <div className="text-left">
                {gateway === 'zarinpal'
                  ? <p className="text-lg font-bold" style={{ color }}>{plan.price_toman?.toLocaleString()} تومان</p>
                  : <p className="text-lg font-bold" style={{ color }}>${plan.price_usd}</p>
                }
              </div>
            </div>

            <ul className="space-y-1.5 mb-4">
              {(plan.features || []).map((f: string) => (
                <li key={f} className="flex items-center gap-2 text-xs">
                  <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                  {f}
                </li>
              ))}
            </ul>

            <button onClick={() => subscribe(plan)} disabled={paying === plan.id}
              className="w-full py-3 rounded-xl text-sm font-bold transition-opacity"
              style={{ background: color, color: '#fff', opacity: paying === plan.id ? .6 : 1 }}>
              {paying === plan.id ? 'در حال انتقال...' : 'خرید اشتراک'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Members (admin) ───────────────────────────────────────────── */
function MembersSection() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('active');
  const [grantUserId, setGrantUserId]   = useState('');
  const [grantLevel,  setGrantLevel]    = useState('basic');
  const [grantDays,   setGrantDays]     = useState('30');

  const { data, isLoading } = useQuery({
    queryKey: ['membership', 'admin-subs', statusFilter],
    queryFn:  () => api.get('/membership/admin/subscriptions', { params: { status: statusFilter, limit: 50 } }).then(r => r.data),
  });
  const items: any[] = data?.items || [];

  const grant = useMutation({
    mutationFn: () => api.post('/membership/admin/grant', {
      user_id: parseInt(grantUserId),
      level:   grantLevel,
      days:    parseInt(grantDays),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['membership'] });
      setGrantUserId('');
      alert('✅ اشتراک اعمال شد');
    },
  });

  const cancel = useMutation({
    mutationFn: (user_id: number) => api.post(`/membership/admin/cancel/${user_id}`, { reason: 'admin_cancel' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membership'] }),
  });

  return (
    <div className="space-y-4">
      {/* Grant manual subscription */}
      <div className="raha-card p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><Gift size={15} />اعطای اشتراک دستی</p>
        <input
          value={grantUserId}
          onChange={e => setGrantUserId(e.target.value)}
          placeholder="User ID وردپرس"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        />
        <div className="flex gap-2">
          <select value={grantLevel} onChange={e => setGrantLevel(e.target.value)}
            className="flex-1 rounded-lg px-2 py-2 text-xs"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <option value="basic">پایه</option>
            <option value="premium">ویژه</option>
            <option value="vip">VIP</option>
          </select>
          <input
            value={grantDays}
            onChange={e => setGrantDays(e.target.value)}
            placeholder="روز"
            className="w-20 rounded-lg px-2 py-2 text-xs text-center"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
          />
          <button onClick={() => grant.mutate()} disabled={!grantUserId || grant.isPending}
            className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'var(--primary)', color: '#fff' }}>
            اعطا
          </button>
        </div>
      </div>

      {/* Expire subscriptions */}
      <ExpireButton />

      {/* Filter */}
      <div className="flex gap-2">
        {(['active', 'expired', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className="flex-1 py-1.5 rounded-xl text-xs font-bold"
            style={{
              background: statusFilter === s ? 'var(--primary)' : 'var(--surface)',
              color:      statusFilter === s ? '#fff' : 'var(--label)',
            }}>
            {s === 'active' ? 'فعال' : s === 'expired' ? 'منقضی' : 'لغو شده'}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-center text-sm py-4" style={{ color: 'var(--label)' }}>بارگذاری...</p>}

      {items.map((sub: any) => (
        <div key={sub.id} className="raha-card p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold">{sub.display_name || sub.user_login || 'کاربر #' + sub.user_id}</p>
              <p className="text-xs" style={{ color: 'var(--label)' }}>{sub.user_email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold" style={{ color: LEVEL_COLOR[sub.access_level] || 'var(--primary)' }}>
                  {LEVEL_ICON[sub.access_level]} {sub.access_level}
                </span>
                {sub.expires_at && (
                  <span className="text-[10px]" style={{ color: 'var(--label)' }}>تا {sub.expires_at.slice(0, 10)}</span>
                )}
              </div>
            </div>
            {sub.status === 'active' && (
              <button onClick={() => { if (confirm('لغو شود؟')) cancel.mutate(parseInt(sub.user_id)); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px]"
                style={{ background: '#ef444420', color: '#ef4444' }}>
                <X size={10} />لغو
              </button>
            )}
          </div>
        </div>
      ))}

      {!isLoading && !items.length && (
        <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>موردی یافت نشد</p>
      )}
    </div>
  );
}

function ExpireButton() {
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    try {
      const { data } = await api.post('/membership/admin/expire');
      alert(`✅ ${data.expired} اشتراک منقضی شد`);
    } catch {
      alert('خطا');
    } finally {
      setRunning(false);
    }
  }
  return (
    <button onClick={run} disabled={running}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <RefreshCw size={13} className={running ? 'animate-spin' : ''} />
      {running ? 'در حال بررسی انقضاها...' : 'اجرای انقضا'}
    </button>
  );
}

/* ── Transactions (admin) ─────────────────────────────────────── */
function TransactionsSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['membership', 'transactions'],
    queryFn:  () => api.get('/membership/admin/transactions', { params: { limit: 50 } }).then(r => r.data),
  });
  const items: any[] = data?.items || [];

  const statusColor: Record<string, string> = {
    completed: '#22c55e',
    pending:   '#f59e0b',
    failed:    '#ef4444',
  };

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--label)' }}>آخرین ۵۰ تراکنش</p>
      {isLoading && <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>بارگذاری...</p>}
      {items.map((tx: any) => (
        <div key={tx.id} className="raha-card p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">{tx.order_id}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--label)' }}>
                {tx.gateway} · {tx.level} · {tx.duration_days} روز
              </p>
              {tx.ref_id && (
                <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--label)' }}>REF: {tx.ref_id}</p>
              )}
            </div>
            <div className="text-left mr-3 flex-shrink-0">
              <p className="text-sm font-bold">
                {parseInt(tx.amount).toLocaleString()}
                <span className="text-[10px] font-normal ml-0.5">{tx.currency}</span>
              </p>
              <span className="text-[10px] font-bold" style={{ color: statusColor[tx.status] || 'var(--label)' }}>
                {tx.status === 'completed' ? '✓ موفق' : tx.status === 'pending' ? '⏳ در انتظار' : '✗ ناموفق'}
              </span>
            </div>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--label)' }}>
            {tx.created_at?.slice(0, 16)}
          </p>
        </div>
      ))}
      {!isLoading && !items.length && (
        <p className="text-center text-sm py-6" style={{ color: 'var(--label)' }}>تراکنشی یافت نشد</p>
      )}
    </div>
  );
}
