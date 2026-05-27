'use client';

import { useEffect, useState } from 'react';

interface Props {
  postId: number;
  children: React.ReactNode;
  subscribeUrl?: string;
}

interface AccessResult {
  can_view:       boolean;
  required_level: string;
  user_level:     string;
}

const LEVEL_LABEL: Record<string, string> = {
  free:    'رایگان',
  basic:   'پایه',
  premium: 'ویژه',
  vip:     'VIP',
};

const LEVEL_COLOR: Record<string, string> = {
  basic:   '#3b82f6',
  premium: '#f59e0b',
  vip:     '#a855f7',
};

export function MembershipGate({ postId, children, subscribeUrl = '/subscribe' }: Props) {
  const [access, setAccess] = useState<AccessResult | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['X-Access-Token'] = token;

    fetch(`/api/membership/check/${postId}`, { headers })
      .then(r => r.json())
      .then(setAccess)
      .catch(() => setAccess({ can_view: true, required_level: 'free', user_level: 'free' }));
  }, [postId]);

  // Loading state
  if (!access) return <>{children}</>;

  // Access granted
  if (access.can_view) return <>{children}</>;

  // Access denied — show paywall
  const color = LEVEL_COLOR[access.required_level] || '#f59e0b';

  return (
    <div className="relative min-h-[400px] rounded-2xl overflow-hidden">
      {/* Blurred preview */}
      <div className="filter blur-sm pointer-events-none select-none opacity-40">
        {children}
      </div>

      {/* Gate overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 60%, rgba(0,0,0,0.6))' }}>

        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-3xl"
          style={{ background: `${color}20`, border: `2px solid ${color}` }}>
          🔒
        </div>

        <h2 className="text-xl font-bold text-white mb-2">محتوای انحصاری</h2>
        <p className="text-sm text-neutral-400 mb-1">
          این محتوا برای اعضای
          <strong className="mx-1" style={{ color }}>{LEVEL_LABEL[access.required_level] || access.required_level}</strong>
          است
        </p>
        <p className="text-xs text-neutral-500 mb-6">
          سطح فعلی شما: {LEVEL_LABEL[access.user_level] || access.user_level}
        </p>

        <a href={subscribeUrl}
          className="px-8 py-3 rounded-xl font-bold text-white text-sm transition-transform hover:scale-105 active:scale-95"
          style={{ background: color, boxShadow: `0 4px 20px ${color}40` }}>
          دریافت اشتراک {LEVEL_LABEL[access.required_level]}
        </a>

        <a href="/login" className="mt-3 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
          ورود به حساب کاربری ↗
        </a>
      </div>
    </div>
  );
}
