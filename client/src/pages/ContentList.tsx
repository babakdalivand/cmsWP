import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, CheckCircle, Clock, FileText, XCircle, ChevronDown, ChevronUp,
  Send, Trash2, ExternalLink, Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  useContentList, useApproveContent, useRejectContent, useSubmitContent,
} from '../hooks/useQueries';
import { api } from '../api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Content {
  id: number;
  title_fa: string;
  title_en: string;
  content_fa?: string;
  content_en?: string;
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'scheduled';
  content_type: string;
  lang: string;
  created_at: string;
  author_name: string;
  wp_post_id?: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft:     { label: 'پیش‌نویس',  icon: <FileText size={12} />,    color: 'text-label border-border' },
  pending:   { label: 'در انتظار', icon: <Clock size={12} />,       color: 'text-warning border-warning/30' },
  scheduled: { label: 'زمان‌بندی', icon: <Clock size={12} />,       color: 'text-blue border-blue/30' },
  published: { label: 'منتشر شده', icon: <CheckCircle size={12} />, color: 'text-success border-success/30' },
  rejected:  { label: 'رد شده',    icon: <XCircle size={12} />,     color: 'text-danger border-danger/30' },
};

const TYPE_EMOJI: Record<string, string> = {
  article: '📄', youtube: '▶️', podcast: '🎙️', media: '🖼️',
};

// Quick publish: submit -> approve in a single click (admin shortcut for drafts)
function useQuickPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/content/${id}/submit`);
      return api.post(`/content/${id}/approve`).then(r => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

function useDeleteContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/content/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  });
}

export default function ContentList() {
  const navigate = useNavigate();
  const isAdmin  = useAuthStore(s => s.isAdmin());
  const [filter, setFilter]     = useState('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isLoading, error } = useContentList(filter);
  const items: Content[] = data?.content ?? [];

  const approveMut = useApproveContent();
  const rejectMut  = useRejectContent();
  const submitMut  = useSubmitContent();
  const publishMut = useQuickPublish();
  const deleteMut  = useDeleteContent();

  async function handleReject(id: number) {
    const note = prompt('دلیل رد:') ?? '';
    rejectMut.mutate({ id, note });
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`حذف «${title || 'این محتوا'}»؟ غیرقابل بازگشت.`)) return;
    deleteMut.mutate(id);
  }

  async function handlePublishOk(result: any) {
    if (result?.fa?.link || result?.wpLink) {
      alert(`✅ منتشر شد!\n\nFA: ${result.fa?.link || result.wpLink}${result.en ? '\nEN: ' + result.en.link : ''}`);
    }
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl" style={{ color: 'var(--text)' }}>محتوا</h1>
        <button onClick={() => navigate('/create')}
          className="bg-blue text-white p-2 rounded-xl hover:bg-blue-hover transition-colors">
          <Plus size={20} />
        </button>
      </div>

      <div className="flex gap-2 mb-4 bg-surface border border-border rounded-xl p-1">
        <button
          onClick={() => navigate('/wp-posts')}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-label hover:text-text transition-colors"
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
              filter === s ? 'bg-blue text-white' : 'bg-surface text-label border border-border hover:text-text'
            }`}>
            {s === 'all' ? 'همه' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">
          خطا در بارگذاری محتوا
        </div>
      )}

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
            const busy = approveMut.isPending || rejectMut.isPending ||
                         submitMut.isPending || publishMut.isPending || deleteMut.isPending;
            const isOpen = expanded === item.id;
            const title  = item.title_fa || item.title_en || 'بدون عنوان';

            return (
              <div key={item.id} className="bg-surface border border-border rounded-xl overflow-hidden hover:border-blue/30 transition-colors">
                {/* Header — clickable to expand */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                  className="w-full text-right p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{TYPE_EMOJI[item.content_type] || '📄'}</span>
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>
                        {title}
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
                    <span className="text-label">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </div>
                </button>

                {/* Expanded panel: actions + preview */}
                {isOpen && (
                  <div className="border-t border-border bg-bg/40 p-3">
                    {/* Preview titles bilingual */}
                    {item.title_en && item.title_fa && (
                      <div className="text-label text-[11px] mb-3 leading-relaxed">
                        🇮🇷 {item.title_fa}<br/>
                        🇬🇧 <span dir="ltr">{item.title_en}</span>
                      </div>
                    )}

                    {/* Action buttons by status */}
                    <div className="flex flex-wrap gap-2">
                      {/* DRAFT actions */}
                      {item.status === 'draft' && (
                        <>
                          {isAdmin && (
                            <ActionBtn
                              icon={<Sparkles size={12} />}
                              label="انتشار فوری"
                              tone="success"
                              busy={busy}
                              onClick={async () => {
                                try {
                                  const result = await publishMut.mutateAsync(item.id);
                                  handlePublishOk(result);
                                } catch (e: any) {
                                  alert('خطا: ' + (e.response?.data?.error || e.message));
                                }
                              }}
                            />
                          )}
                          <ActionBtn
                            icon={<Send size={12} />}
                            label="ارسال جهت بررسی"
                            tone="blue"
                            busy={busy}
                            onClick={() => submitMut.mutate(item.id)}
                          />
                        </>
                      )}

                      {/* PENDING actions */}
                      {item.status === 'pending' && isAdmin && (
                        <>
                          <ActionBtn
                            icon={<CheckCircle size={12} />}
                            label="تأیید و انتشار"
                            tone="success"
                            busy={busy}
                            onClick={async () => {
                              try {
                                const r = await approveMut.mutateAsync(item.id);
                                handlePublishOk(r);
                              } catch (e: any) {
                                alert('خطا: ' + (e.response?.data?.error || e.message));
                              }
                            }}
                          />
                          <ActionBtn
                            icon={<XCircle size={12} />}
                            label="رد"
                            tone="danger"
                            busy={busy}
                            onClick={() => handleReject(item.id)}
                          />
                        </>
                      )}

                      {/* REJECTED — resubmit */}
                      {item.status === 'rejected' && (
                        <ActionBtn
                          icon={<Send size={12} />}
                          label="ارسال مجدد"
                          tone="blue"
                          busy={busy}
                          onClick={() => submitMut.mutate(item.id)}
                        />
                      )}

                      {/* PUBLISHED — link to live post */}
                      {item.status === 'published' && item.wp_post_id && (
                        <ActionBtn
                          icon={<ExternalLink size={12} />}
                          label="مشاهده در سایت"
                          tone="blue"
                          busy={false}
                          onClick={() => window.open(`https://persianatheists.com/?p=${item.wp_post_id}`, '_blank')}
                        />
                      )}

                      {/* DELETE — always available for owner/admin */}
                      <ActionBtn
                        icon={<Trash2 size={12} />}
                        label="حذف"
                        tone="danger"
                        busy={busy}
                        onClick={() => handleDelete(item.id, title)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon, label, tone, busy, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'success' | 'danger' | 'blue' | 'warning';
  busy: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === 'success' ? 'text-success border-success/30 hover:bg-success/10'
    : tone === 'danger' ? 'text-danger border-danger/30 hover:bg-danger/10'
    : tone === 'warning' ? 'text-warning border-warning/30 hover:bg-warning/10'
    : 'text-blue border-blue/30 hover:bg-blue/10';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}
