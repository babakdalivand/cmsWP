import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WatchProgress } from '@/types';

interface HistoryStore {
  history: WatchProgress[];
  saveProgress: (item: Omit<WatchProgress, 'lastWatched'>) => void;
  getProgress:  (ytId: string) => WatchProgress | undefined;
  removeEntry:  (ytId: string) => void;
  clearHistory: () => void;
  // "Continue watching" = entries with 5–95% progress, sorted by most recent
  getContinueWatching: (limit?: number) => WatchProgress[];
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set, get) => ({
      history: [],

      saveProgress(item) {
        const entry: WatchProgress = { ...item, lastWatched: Date.now() };
        set((state) => {
          const filtered = state.history.filter((h) => h.ytId !== item.ytId);
          return { history: [entry, ...filtered].slice(0, 500) };
        });
      },

      getProgress(ytId) {
        return get().history.find((h) => h.ytId === ytId);
      },

      removeEntry(ytId) {
        set((state) => ({ history: state.history.filter((h) => h.ytId !== ytId) }));
      },

      clearHistory() {
        set({ history: [] });
      },

      getContinueWatching(limit = 20) {
        return get()
          .history
          .filter((h) => h.progress > 0.05 && h.progress < 0.95)
          .sort((a, b) => b.lastWatched - a.lastWatched)
          .slice(0, limit);
      },
    }),
    { name: 'pa-watch-history' }
  )
);
