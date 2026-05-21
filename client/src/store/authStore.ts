import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: number;
  wpUserId: number;
  username: string;
  displayName: string;
  email: string;
  role: 'admin' | 'editor';
  avatarUrl: string | null;
}

interface AuthStore {
  token:        string | null;
  refreshToken: string | null;
  user:         User | null;
  login:        (token: string, refreshToken: string, user: User) => void;
  setToken:     (token: string) => void;
  setRefreshToken: (refreshToken: string) => void;
  logout:       () => void;
  isAdmin:      () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token:        null,
      refreshToken: null,
      user:         null,
      login: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setToken:        (token) => set({ token }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      logout: () => set({ token: null, refreshToken: null, user: null }),
      isAdmin: () => get().user?.role === 'admin',
    }),
    { name: 'cms-auth' }
  )
);
