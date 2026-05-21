import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

export const api = axios.create({ baseURL: '/api', timeout: 30000 });

// Attach Bearer token to every request
api.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Silent token refresh on 401
let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;

      const { refreshToken, setToken, setRefreshToken, logout } = useAuthStore.getState();

      if (!refreshToken) {
        logout();
        window.location.href = '/login';
        return Promise.reject(err);
      }

      try {
        // Deduplicate concurrent refresh calls
        if (!refreshing) {
          refreshing = axios
            .post('/api/auth/refresh', { refreshToken })
            .then((res) => {
              setToken(res.data.token);
              setRefreshToken(res.data.refreshToken);
              return res.data.token as string;
            })
            .finally(() => { refreshing = null; });
        }

        const newToken = await refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        logout();
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }

    return Promise.reject(err);
  }
);
