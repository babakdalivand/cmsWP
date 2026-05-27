import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Camera, LogOut, Edit2, Check, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout: storeLogout } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [msg, setMsg] = useState('');

  const showMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  const doLogout = async () => {
    try {
      await api.post('/auth/logout', { refreshToken: useAuthStore.getState().refreshToken });
    } catch { /* ignore */ }
    sessionStorage.setItem('manual_logout', '1');
    storeLogout();
    navigate('/login', { replace: true });
  };

  const updateProfile = useMutation({
    mutationFn: (data: { displayName?: string; avatarUrl?: string }) =>
      api.patch('/auth/profile', data).then(r => r.data),
    onSuccess: (fresh) => {
      useAuthStore.setState((s: any) => ({
        ...s,
        user: {
          ...s.user,
          displayName: fresh.display_name ?? s.user?.displayName,
          avatarUrl:   fresh.avatar_url   ?? s.user?.avatarUrl,
        },
      }));
      setEditingName(false);
      showMsg('✅ ذخیره شد');
    },
    onError: (e: any) => showMsg('❌ ' + (e?.response?.data?.error || e?.message)),
  });

  const fixRole = useMutation({
    mutationFn: () => api.post('/auth/fix-role').then(r => r.data),
    onSuccess: (d) => {
      useAuthStore.setState((s: any) => ({
        ...s,
        user: { ...s.user, role: d.role },
      }));
      showMsg(`✅ نقش ${d.role === 'admin' ? 'مدیر' : 'ویرایشگر'} — ${d.message}`);
    },
    onError: (e: any) => showMsg('❌ ' + (e?.response?.data?.error || e?.message)),
  });

  const uploadAvatar = async (file: File) => {
    setUploadMsg('⏳ در حال آپلود...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/wp/media', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url: string = data.source_url || data.guid?.rendered || '';
      if (!url) throw new Error('URL تصویر دریافت نشد');
      await updateProfile.mutateAsync({ avatarUrl: url });
      setAvatarFailed(false);
      setUploadMsg('');
    } catch (e: any) {
      setUploadMsg('❌ ' + (e?.response?.data?.error || e?.message));
      setTimeout(() => setUploadMsg(''), 4000);
    }
  };

  const initial = (user?.displayName || user?.username || 'U').charAt(0).toUpperCase();
  const avatarSrc = user?.avatarUrl && !avatarFailed
    ? user.avatarUrl.replace(/([?&])s=\d+/, '$1s=192')
    : null;

  return (
    <div className="px-4 pt-5 pb-28" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <ChevronLeft size={18} style={{ color: 'var(--text)' }} />
        </button>
        <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>پروفایل</h2>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={user?.displayName || ''}
              onError={() => setAvatarFailed(true)}
              className="w-24 h-24 rounded-2xl object-cover"
              style={{ border: '3px solid var(--primary)' }}
            />
          ) : (
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center font-bold text-white text-3xl"
              style={{ background: 'var(--grad-primary)', border: '3px solid var(--primary)' }}
            >
              {initial}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-2 -left-2 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--primary)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <Camera size={15} color="#fff" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }}
        />

        {uploadMsg && (
          <p className="mt-3 text-xs" style={{ color: uploadMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
            {uploadMsg}
          </p>
        )}
        <p className="mt-3 text-label text-xs">برای تغییر تصویر روی دوربین کلیک کنید</p>
      </div>

      {/* Info card */}
      <div className="raha-card p-4 mb-4 flex flex-col gap-4">

        {/* Display name */}
        <div>
          <p className="text-label text-[11px] mb-1.5">نام نمایشی</p>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--primary)', color: 'var(--text)', outline: 'none' }}
                autoFocus
              />
              <button
                onClick={() => updateProfile.mutate({ displayName })}
                disabled={updateProfile.isPending}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: '#dcfce7' }}
              >
                <Check size={16} color="#16a34a" />
              </button>
              <button
                onClick={() => { setEditingName(false); setDisplayName(user?.displayName || ''); }}
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: '#fee2e2' }}
              >
                <X size={16} color="#dc2626" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {user?.displayName || '—'}
              </p>
              <button
                onClick={() => setEditingName(true)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--primary-soft)' }}
              >
                <Edit2 size={13} style={{ color: 'var(--primary)' }} />
              </button>
            </div>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Username */}
        <div>
          <p className="text-label text-[11px] mb-1.5">نام کاربری</p>
          <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>@{user?.username}</p>
        </div>

        {user?.email && (
          <>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <p className="text-label text-[11px] mb-1.5">ایمیل</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{user.email}</p>
            </div>
          </>
        )}

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Role */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-label text-[11px] mb-1.5">نقش</p>
            <span
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{
                background: user?.role === 'admin' ? '#22c55e20' : '#f59e0b20',
                color:      user?.role === 'admin' ? '#16a34a'   : '#d97706',
              }}
            >
              {user?.role === 'admin' ? '👑 مدیر ارشد' : '✏️ ویرایشگر'}
            </span>
          </div>
          {user?.role !== 'admin' && (
            <button
              onClick={() => fixRole.mutate()}
              disabled={fixRole.isPending}
              className="text-xs px-3 py-2 rounded-xl font-medium"
              style={{ background: '#dbeafe', color: '#2563eb' }}
            >
              {fixRole.isPending ? '...' : '🔧 اصلاح نقش'}
            </button>
          )}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div
          className="rounded-xl px-4 py-3 mb-4 text-sm text-center"
          style={{
            background: msg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
            color:      msg.startsWith('✅') ? '#16a34a' : '#dc2626',
          }}
        >
          {msg}
        </div>
      )}

      {/* Logout */}
      <button
        onClick={doLogout}
        className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
        style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
      >
        <LogOut size={18} />
        خروج از حساب کاربری
      </button>
    </div>
  );
}
