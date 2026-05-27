'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/',          icon: '🏠', label: 'خانه' },
  { href: '/shorts',    icon: '📱', label: 'شورت' },
  { href: '/search',    icon: '🔍', label: 'جستجو' },
  { href: '/favorites', icon: '❤️', label: 'لیست' },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-[#1a1a1a]/95 backdrop-blur-md border-t border-white/5 pb-safe-bottom">
      <div className="flex items-center justify-around h-14">
        {TABS.map(({ href, icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all',
                active ? 'text-brand-light' : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
