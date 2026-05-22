import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Image, Sparkles, Activity } from 'lucide-react';

const TABS = [
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
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-sm border-t border-border z-50" dir="rtl">
      <div className="flex items-center justify-around py-2 px-1">
        {TABS.map(({ path, icon: Icon, label, match }) => {
          const active = match ? match.some(m => pathname.startsWith(m)) : pathname === path;
          return (
            <button key={path} onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors ${active ? 'text-blue' : 'text-label hover:text-white'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
