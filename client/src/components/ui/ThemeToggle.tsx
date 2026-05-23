import { useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Animated theme toggle.
 *  - Sun/Moon icon swap with rotation + scale tween
 *  - On click, expanding circular reveal from the button's screen position
 *    is driven by ThemeContext.toggle()
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);
  const isLight = theme === 'light';

  function onClick() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      toggle(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      toggle();
    }
  }

  return (
    <button
      ref={btnRef}
      onClick={onClick}
      aria-label={isLight ? 'تم تاریک' : 'تم روشن'}
      className={`relative w-10 h-10 rounded-full bg-surface border border-border overflow-hidden flex items-center justify-center hover:border-blue/40 transition-colors ${className}`}
      data-no-theme-transition
    >
      {/* Sun */}
      <svg
        viewBox="0 0 24 24"
        className={`absolute w-5 h-5 transition-all duration-500 ease-out ${
          isLight ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
        }`}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--primary)' }}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>

      {/* Moon */}
      <svg
        viewBox="0 0 24 24"
        className={`absolute w-5 h-5 transition-all duration-500 ease-out ${
          isLight ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
        }`}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--primary)' }}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
