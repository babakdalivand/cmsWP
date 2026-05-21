import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Fingerprint, Globe } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.token, data.refreshToken, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'خطا در ورود');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6" dir="rtl">
      {/* WP Logo */}
      <div className="mb-10 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center shadow-lg shadow-blue/10">
          <Globe size={44} className="text-blue" strokeWidth={1.5} />
        </div>
        <h1 className="text-xl font-bold text-white">CMS Mini App</h1>
        <p className="text-label text-sm">مدیریت محتوای وردپرس</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder="نام کاربری وردپرس"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-white placeholder-label focus:outline-none focus:border-blue transition-colors text-right"
            required
          />
        </div>

        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            placeholder="رمز عبور"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-surface border border-border rounded-xl px-4 py-4 text-white placeholder-label focus:outline-none focus:border-blue transition-colors text-right pr-4 pl-12"
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-label"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue hover:bg-blue-hover disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors"
        >
          {loading ? 'در حال ورود...' : 'ورود به وردپرس'}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-label text-xs">یا</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          type="button"
          className="w-full bg-surface border border-border text-label py-4 rounded-xl flex items-center justify-center gap-2 hover:border-blue/50 transition-colors"
        >
          <Fingerprint size={20} />
          <span>ورود بیومتریک</span>
        </button>
      </form>
    </div>
  );
}
