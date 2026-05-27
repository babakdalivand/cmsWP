import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FavoriteItem } from '@/types';

interface FavoritesStore {
  items: FavoriteItem[];
  add:       (item: Omit<FavoriteItem, 'addedAt'>) => void;
  remove:    (postId: number) => void;
  toggle:    (item: Omit<FavoriteItem, 'addedAt'>) => void;
  isFav:     (postId: number) => boolean;
  clear:     () => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      items: [],

      add(item) {
        if (get().isFav(item.postId)) return;
        set((s) => ({ items: [{ ...item, addedAt: Date.now() }, ...s.items] }));
      },

      remove(postId) {
        set((s) => ({ items: s.items.filter((i) => i.postId !== postId) }));
      },

      toggle(item) {
        get().isFav(item.postId) ? get().remove(item.postId) : get().add(item);
      },

      isFav(postId) {
        return get().items.some((i) => i.postId === postId);
      },

      clear() {
        set({ items: [] });
      },
    }),
    { name: 'pa-favorites' }
  )
);
