import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  parent: number;
}

export default function Categories() {
  const isAdmin = useAuthStore(s => s.isAdmin());
  const qc      = useQueryClient();

  const [creating, setCreating]   = useState(false);
  const [editing, setEditing]     = useState<number | null>(null);
  const [form, setForm]           = useState({ name: '', slug: '', description: '', parent: 0 });
  const [toast, setToast]         = useState('');

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn:  () => api.get('/wp/categories').then(r => r.data as Category[]),
  });

  const createMut = useMutation({
    mutationFn: (payload: any) => api.post('/wp/categories', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['wpCats'] });
      resetForm();
      showToast('دسته‌بندی ایجاد شد ✓');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'خطا'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      api.put(`/wp/categories/${id}`, payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['wpCats'] });
      resetForm();
      showToast('دسته‌بندی به‌روزرسانی شد ✓');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'خطا'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/wp/categories/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['wpCats'] });
      showToast('دسته‌بندی حذف شد');
    },
    onError: (e: any) => showToast(e.response?.data?.error || 'خطا'),
  });

  function resetForm() {
    setForm({ name: '', slug: '', description: '', parent: 0 });
    setCreating(false);
    setEditing(null);
  }

  function startEdit(cat: Category) {
    setEditing(cat.id);
    setCreating(false);
    setForm({ name: cat.name, slug: cat.slug, description: cat.description, parent: cat.parent });
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name,
      slug: form.slug || undefined,
      description: form.description || undefined,
      parent: form.parent || 0,
    };
    if (editing) updateMut.mutate({ id: editing, payload });
    else         createMut.mutate(payload);
  }

  function handleDelete(cat: Category) {
    if (cat.id === 1) {
      showToast('دسته «بدون دسته» قابل حذف نیست');
      return;
    }
    if (!confirm(`حذف دسته‌بندی «${cat.name}»؟`)) return;
    deleteMut.mutate(cat.id);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  if (!isAdmin) {
    return (
      <div className="p-4 pb-28" dir="rtl">
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-4">
          ⛔ فقط مدیر می‌تواند دسته‌بندی‌ها را مدیریت کند.
        </div>
      </div>
    );
  }

  const busy = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-bold text-xl">دسته‌بندی‌ها</h1>
        {!creating && !editing && (
          <button onClick={() => setCreating(true)}
            className="bg-blue text-white p-2 rounded-xl hover:bg-blue-hover transition-colors">
            <Plus size={18} />
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-surface border border-blue/30 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      {(creating || editing) && (
        <div className="bg-surface border border-blue/30 rounded-xl p-4 mb-4">
          <h2 className="text-white font-medium text-sm mb-3">
            {editing ? 'ویرایش دسته' : 'دسته جدید'}
          </h2>
          <div className="flex flex-col gap-3">
            <input
              placeholder="نام دسته"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue"
            />
            <input
              placeholder="نام مستعار (slug) — اختیاری"
              dir="ltr"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue"
            />
            <textarea
              placeholder="توضیحات — اختیاری"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue resize-none"
            />
            <select
              value={form.parent}
              onChange={(e) => setForm({ ...form, parent: parseInt(e.target.value) || 0 })}
              className="bg-bg border border-border rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue"
            >
              <option value={0}>بدون دسته والد</option>
              {cats.filter(c => c.id !== editing).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <div className="flex gap-2 mt-1">
              <button
                onClick={handleSubmit}
                disabled={busy || !form.name.trim()}
                className="flex-1 bg-blue text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
              >
                <Check size={14} />
                {busy ? '...' : (editing ? 'به‌روزرسانی' : 'ایجاد')}
              </button>
              <button
                onClick={resetForm}
                className="px-4 bg-surface border border-border text-label py-2.5 rounded-lg text-sm hover:text-white transition-colors"
              >
                لغو
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-14 animate-pulse" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <div className="text-center text-label py-16">
          <Folder size={40} className="mx-auto mb-2 opacity-30" />
          <p>دسته‌بندی‌ای یافت نشد</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cats.map(cat => (
            <div key={cat.id}
              className={`bg-surface border rounded-xl p-3 flex items-center justify-between transition-colors ${
                editing === cat.id ? 'border-blue/40' : 'border-border'
              }`}>
              <div className="flex items-center gap-3 min-w-0">
                <Folder size={16} className="text-blue flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{cat.name}</p>
                  <p className="text-label text-xs">
                    <span dir="ltr">{cat.slug}</span> · {cat.count} پست
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(cat)}
                  className="text-label hover:text-blue p-2 rounded-lg hover:bg-blue/10 transition-colors"
                  title="ویرایش"
                >
                  <Edit2 size={14} />
                </button>
                {cat.id !== 1 && (
                  <button
                    onClick={() => handleDelete(cat)}
                    disabled={deleteMut.isPending}
                    className="text-danger/70 hover:text-danger p-2 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-40"
                    title="حذف"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
