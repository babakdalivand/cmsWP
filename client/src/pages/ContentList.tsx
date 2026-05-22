import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle, Clock, FileText, XCircle, ChevronLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useContentList, useApproveContent, useRejectContent } from '../hooks/useQueries';

interface Content {
  id: number;
  title_fa: string;
  title_en: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  content_type: string;
  lang: string;
  created_at: string;
  author_name: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft:     { label: 'پیش‌نویس',  icon: <FileText size={12} />,    color: 'text-label border-border' },
  pending:   { label: 'در انتظار', icon: <Clock size={12} />,       color: 'text-warning border-warning/30' },
  published: { label: 'منتشر شده', icon: <CheckCircle size={12} />, color: 'text-success border-success/30' },
  rejected:  { label: 'رد شده',    icon: <XCircle size={12} />,     color: 'text-danger border-danger/30' },
};

const TYPE_EMOJI: Record<string, string> = {
  article: '📄', youtube: '▶️', podcast: '🎙️', media: '🖼️',
};

export default function ContentList() {
  const navigate = useNavigate();
  const isAdmin  = useAuthStore(s => s.isAdmin());
  const [filter, setFilter] = useState('all');

  const { data, isLoading, error } = useContentList(filter);
  const items: Content[] = data?.content ?? [];

  const approveMut = useApproveContent();
  const rejectMut  = useRejectContent();

  async function handleReject(id: number) {
    const note = prompt('دلیل رد:') ?? '';
    rejectMut.mutate({ id, note });
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-bold text-xl">محتوا</h1>
        <button onClick={() => navigate('/create')}
          className="bg-blue text-white p-2 rounded-xl hover:bg-blue-hover transition-colors">
          <Plus size={20} />
        </button>
      </div>

      <div className="flex gap-2 mb-4 bg-surface border border-border rounded-xl p-1">
        <button
          onClick={() => navigate('/wp-posts')}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-label hover:text-white transition-colors"
        >
          پست‌های سایت
        </button>
        <button
          onClick={() => navigate('/content')}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue text-white"
        >
          محتوای داخلی
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {['all', 'draft', 'pending', 'published', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              filter === s ? 'bg-blue text-white' : 'bg-surface text-label border border-border hover:text-white'
            }`}>
            {s === 'all' ? 'همه' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">
          خطا در بارگذاری محتوا
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center text-label py-16">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p>محتوایی یافت نشد</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => {
            const s = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
            const busy = approveMut.isPending || rejectMut.isPending;
            return (
              <div key={item.id} className="bg-surface border border-border rounded-xl p-4 hover:border-blue/30 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{TYPE_EMOJI[item.content_type] || '📄'}</span>
                    <p className="text-white font-medium text-sm truncate">
                      {item.title_fa || item.title_en || 'بدون عنوان'}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${s.color}`}>
                    {s.icon} {s.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-label text-xs">
                    {item.author_name} · {new Date(item.created_at).toLocaleDateString('fa-IR')}
                  </span>
                  <div className="flex gap-2">
                    {isAdmin && item.status === 'pending' && (
                      <>
                        <button onClick={() => approveMut.mutate(item.id)} disabled={busy}
                          className="text-xs text-success border border-success/30 px-2 py-1 rounded-lg hover:bg-success/10 disabled:opacity-40">
                          تأیید
                        </button>
                        <button onClick={() => handleReject(item.id)} disabled={busy}
                          className="text-xs text-danger border border-danger/30 px-2 py-1 rounded-lg hover:bg-danger/10 disabled:opacity-40">
                          رد
                        </button>
                      </>
                    )}
                    <button className="text-label hover:text-blue transition-colors">
                      <ChevronLeft size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
