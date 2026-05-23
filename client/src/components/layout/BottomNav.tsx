import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Image, Sparkles, Activity } from 'lucide-react';

interface Tab {
  path: string;
  icon: React.ComponentType<any>;
  label: string;
  match?: string[];
}

const TABS: Tab[] = [
  { path: '/',          icon: LayoutDashboard, label: 'داشبورد' },
  { path: '/wp-posts',  icon: FileText,        label: 'محتوا', match: ['/wp-posts', '/wp-edit', '/content'] },
  { path: '/create',    icon: Sparkles,        label: 'ایجاد' },
  { path: '/media',     icon: Image,           label: 'رسانه' },
  { path: '/monitoring',icon: Activity,        label: 'نظارت' },
];

export default function BottomNav() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      dir="rtl"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center justify-around py-2 px-1 max-w-lg mx-auto">
        {TABS.map(({ path, icon: Icon, label, match }) => {
          const isCreate = path === '/create';
          const active = match
            ? match.some(m => pathname.startsWith(m))
            : pathname === path;

          if (isCreate) {
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex flex-col items-center justify-center -mt-6"
                aria-label={label}
              >
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                  style={{
                    background: 'var(--grad-primary)',
                    boxShadow: '0 8px 22px rgba(79,184,180,0.4), 0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  <Icon size={22} color="#fff" strokeWidth={2.2} />
                </span>
                <span className="text-[10px] font-medium mt-1" style={{ color: 'var(--label)' }}>
                  {label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors"
              style={{ color: active ? 'var(--primary)' : 'var(--label)' }}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
