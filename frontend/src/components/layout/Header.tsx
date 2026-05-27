'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/',        label: 'خانه' },
  { href: '/shorts',  label: 'شورت‌ها' },
  { href: '/series',  label: 'مجموعه‌ها' },
  { href: '/favorites', label: 'لیست من' },
];

export function Header() {
  const [scrolled,     setScrolled]     = useState(false);
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, [searchQuery, router]);

  return (
    <header className={cn(
      'fixed top-0 inset-x-0 z-50 transition-all duration-300',
      scrolled
        ? 'bg-[#141414]/95 backdrop-blur-md shadow-lg shadow-black/20'
        : 'bg-gradient-to-b from-black/70 to-transparent'
    )}>
      <div className="max-w-[1800px] mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center gap-4">

        {/* Logo */}
        <Link href="/" className="flex-shrink-0 flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-md bg-brand flex items-center justify-center text-white font-bold text-sm">
            PA
          </div>
          <span className="hidden sm:block font-bold text-white text-base group-hover:text-brand-light transition-colors">
            پرشین ایتئیست‌ها
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 mr-4">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                pathname === href
                  ? 'text-white bg-white/10'
                  : 'text-neutral-300 hover:text-white hover:bg-white/5'
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center gap-2 animate-fade-in">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو..."
                className="w-40 sm:w-64 bg-black/60 border border-white/20 rounded-full px-4 py-1.5 text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-brand-light"
              />
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="text-neutral-400 hover:text-white transition-colors"
                aria-label="بستن جستجو"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-neutral-300 hover:text-white transition-colors"
              aria-label="جستجو"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
