import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtime(intervalMs = 30_000) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['yt', '/queue', { status: 'pending' }] });
      qc.invalidateQueries({ queryKey: ['yt', '/queue', { status: 'pending', limit: 50, offset: 0 }] });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [qc, intervalMs]);
}
