import { useState } from 'react';
import {
  MessageSquare, Check, X, Trash2, Reply, Sparkles, Clock, ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import {
  useComments, useUpdateComment, useDeleteComment, useReplyComment, usePostAIJob, useAIJob,
} from '../hooks/useQueries';
import { useAuthStore } from '../store/authStore';

interface WPComment {
  id: number;
  post: number;
  author_name: string;
  author_email?: string;
  author_avatar_urls?: Record<string, string>;
  content: { rendered: string };
  date: string;
  status: 'approved' | 'hold' | 'spam' | 'trash' | string;
  link: string;
  parent: number;
}

const STATUS_FILTERS = [
  { id: 'any',      label: 'همه',       color: '' },
  { id: 'hold',     label: 'در انتظار', color: 'text-warning border-warning/30' },
  { id: 'approved', label: 'تأیید شده', color: 'text-success border-success/30' },
  { id: 'spam',     label: 'اسپم',      color: 'text-danger border-danger/30' },
  { id: 'trash',    label: 'حذف شده',   color: 'text-label border-border' },
];

export default function Comments() {
  const isAdmin = useAuthStore(s => s.isAdmin());
  const [filter, setFilter] = useState('any');

  const { data, isLoading, error } = useComments(filter);
  const updateMut = useUpdateComment();
  const deleteMut = useDeleteComment();
  const replyMut  = useReplyComment();

  const comments: WPComment[] = data?.comments ?? [];

  if (!isAdmin) {
    return (
      <div className="p-4 pb-28" dir="rtl">
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-4 flex items-center gap-2">
          <AlertTriangle size={16} /> فقط مدیر می‌تواند دیدگاه‌ها را مدیریت کند.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl" style={{ color: 'var(--text)' }}>دیدگاه‌ها</h1>
        {data?.total ? <span className="text-label text-xs">{data.total} مورد</span> : null}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              filter === f.id
                ? 'bg-blue text-white'
                : 'bg-surface text-label border border-border hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">
          خطا در بارگذاری دیدگاه‌ها
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center text-label py-16">
          <MessageSquare size={40} className="mx-auto mb-2 opacity-30" />
          <p>دیدگاهی یافت نشد</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map(c => (
            <CommentCard
              key={c.id}
              comment={c}
              onApprove={() => updateMut.mutate({ id: c.id, payload: { status: 'approved' } })}
              onHold={() => updateMut.mutate({ id: c.id, payload: { status: 'hold' } })}
              onSpam={() => updateMut.mutate({ id: c.id, payload: { status: 'spam' } })}
              onTrash={() => updateMut.mutate({ id: c.id, payload: { status: 'trash' } })}
              onDelete={() => {
                if (confirm(`حذف دائمی دیدگاه از «${c.author_name}»؟`)) {
                  deleteMut.mutate({ id: c.id, force: true });
                }
              }}
              onReply={(content) => replyMut.mutateAsync({ id: c.id, content })}
              busy={updateMut.isPending || deleteMut.isPending || replyMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CommentCard({
  comment, onApprove, onHold, onSpam, onTrash, onDelete, onReply, busy,
}: {
  comment: WPComment;
  onApprove: () => void;
  onHold: () => void;
  onSpam: () => void;
  onTrash: () => void;
  onDelete: () => void;
  onReply: (content: string) => Promise<any>;
  busy: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiJobId, setAiJobId] = useState<string | null>(null);

  const postJobMut = usePostAIJob();
  const { data: jobData } = useAIJob(aiJobId);

  // When AI job finishes, drop the result into the reply box
  if (aiJobId && jobData?.status === 'completed' && jobData.result && !aiSuggestion) {
    const clean = String(jobData.result).replace(/<[^>]*>/g, '').trim();
    setAiSuggestion(clean);
    setReplyText(clean);
    setAiJobId(null);
  }

  async function generateAIReply() {
    const commentText = comment.content.rendered.replace(/<[^>]*>/g, '').trim();
    try {
      const { jobId } = await postJobMut.mutateAsync({
        provider: 'gemini',
        action:   'reply',
        prompt:   `یک پاسخ کوتاه، مودبانه و سازنده به دیدگاه زیر بنویس. خلاصه و در حد یک پاراگراف کوتاه. زبان پاسخ همان زبان دیدگاه باشد.\n\nدیدگاه:\n"${commentText}"`,
      });
      setAiJobId(jobId);
      setReplyOpen(true);
    } catch (e: any) {
      alert('خطا: ' + (e.response?.data?.error || e.message));
    }
  }

  async function submitReply() {
    if (!replyText.trim()) return;
    try {
      await onReply(replyText);
      setReplyOpen(false);
      setReplyText('');
      setAiSuggestion(null);
    } catch (e: any) {
      alert('خطا در ارسال پاسخ: ' + (e.response?.data?.error || e.message));
    }
  }

  const statusBadge =
    comment.status === 'approved' ? { label: '✓ تأیید', color: 'text-success border-success/30' }
    : comment.status === 'hold'   ? { label: '⏳ در انتظار', color: 'text-warning border-warning/30' }
    : comment.status === 'spam'   ? { label: '🚫 اسپم', color: 'text-danger border-danger/30' }
    :                                { label: '🗑 حذف', color: 'text-label border-border' };

  const aiLoading = !!aiJobId || postJobMut.isPending;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-2">
        <img
          src={comment.author_avatar_urls?.['48'] || comment.author_avatar_urls?.['96'] || ''}
          alt={comment.author_name}
          className="w-9 h-9 rounded-full bg-bg flex-shrink-0"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>
              {comment.author_name}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${statusBadge.color}`}>
              {statusBadge.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-label text-[10px]">
            <Clock size={10} />
            {new Date(comment.date).toLocaleDateString('fa-IR')}
            <a
              href={comment.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue hover:underline flex items-center gap-1"
            >
              <ExternalLink size={10} /> پست #{comment.post}
            </a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        className="text-sm leading-relaxed mt-2 mb-3 px-1"
        style={{ color: 'var(--text)' }}
        dangerouslySetInnerHTML={{ __html: comment.content.rendered }}
      />

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
        {comment.status !== 'approved' && (
          <ActionBtn icon={<Check size={12} />} label="تأیید" tone="success" onClick={onApprove} busy={busy} />
        )}
        {comment.status === 'approved' && (
          <ActionBtn icon={<X size={12} />} label="عقب‌نشینی" tone="warning" onClick={onHold} busy={busy} />
        )}
        <ActionBtn icon={<Reply size={12} />} label="پاسخ" tone="blue"
          onClick={() => setReplyOpen(o => !o)} busy={busy} />
        <ActionBtn icon={<Sparkles size={12} />} label={aiLoading ? 'AI...' : 'پاسخ با AI'}
          tone="blue" onClick={generateAIReply} busy={busy || aiLoading} />
        {comment.status !== 'spam' && (
          <ActionBtn icon={<AlertTriangle size={12} />} label="اسپم" tone="danger" onClick={onSpam} busy={busy} />
        )}
        {comment.status !== 'trash' && (
          <ActionBtn icon={<Trash2 size={12} />} label="حذف" tone="danger" onClick={onTrash} busy={busy} />
        )}
        {comment.status === 'trash' && (
          <ActionBtn icon={<Trash2 size={12} />} label="حذف دائم" tone="danger" onClick={onDelete} busy={busy} />
        )}
      </div>

      {/* Reply box */}
      {replyOpen && (
        <div className="mt-3 pt-3 border-t border-border">
          {aiSuggestion && (
            <p className="text-blue text-[10px] mb-2 flex items-center gap-1">
              <Sparkles size={10} /> پیشنهاد AI — می‌توانید ویرایش کنید
            </p>
          )}
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="پاسخ خود را بنویسید..."
            rows={3}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue resize-none"
            style={{ color: 'var(--text)' }}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={submitReply}
              disabled={busy || !replyText.trim()}
              className="flex-1 bg-blue text-white py-2 rounded-lg text-xs font-medium hover:bg-blue-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
            >
              <Reply size={12} /> ارسال پاسخ
            </button>
            <button
              onClick={() => { setReplyOpen(false); setReplyText(''); setAiSuggestion(null); }}
              className="px-4 bg-surface border border-border text-label py-2 rounded-lg text-xs hover:text-text transition-colors"
            >
              لغو
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon, label, tone, onClick, busy,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'blue';
  onClick: () => void;
  busy: boolean;
}) {
  const cls =
    tone === 'success' ? 'text-success border-success/30 hover:bg-success/10'
    : tone === 'warning' ? 'text-warning border-warning/30 hover:bg-warning/10'
    : tone === 'danger' ? 'text-danger border-danger/30 hover:bg-danger/10'
    : 'text-blue border-blue/30 hover:bg-blue/10';
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}
