import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: (originX?: number, originY?: number) => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'raha-theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  // Respect Telegram WebApp scheme if available
  const tgScheme = (window as any).Telegram?.WebApp?.colorScheme as Theme | undefined;
  if (tgScheme === 'light' || tgScheme === 'dark') return tgScheme;
  // Fall back to OS preference
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Apply theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  // Animated toggle: morph overlay expanding from origin
  const toggle = useCallback((originX?: number, originY?: number) => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';

    // Default origin: top-right corner (where the toggle usually lives)
    const x = originX ?? window.innerWidth - 24;
    const y = originY ?? 60;

    const overlay = document.createElement('div');
    overlay.className = 'theme-morph-overlay';
    overlay.style.setProperty('--morph-x', `${x}px`);
    overlay.style.setProperty('--morph-y', `${y}px`);

    // Pre-render with NEXT theme's bg color so the expanding circle reveals it
    overlay.setAttribute('data-theme', next);
    // Force inline background from the data-theme value
    const tmp = document.createElement('div');
    tmp.setAttribute('data-theme', next);
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    const nextBg = getComputedStyle(tmp).getPropertyValue('--bg').trim();
    document.body.removeChild(tmp);
    overlay.style.background = nextBg;

    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    // Force reflow then expand
    void overlay.offsetWidth;
    requestAnimationFrame(() => overlay.classList.add('expanding'));

    // Halfway through the morph, swap the real theme
    window.setTimeout(() => setThemeState(next), 350);

    // After morph completes, fade out and remove
    window.setTimeout(() => {
      overlay.style.transition = 'opacity 0.25s ease';
      overlay.style.opacity = '0';
      window.setTimeout(() => overlay.remove(), 260);
    }, 700);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside <ThemeProvider>');
  return ctx;
}
