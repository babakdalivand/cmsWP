'use client';
import { useEffect, useRef } from 'react';

export function useIntersectionObserver(
  callback: () => void,
  options?: IntersectionObserverInit
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) callback();
    }, options ?? { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [callback, options]);

  return ref;
}
