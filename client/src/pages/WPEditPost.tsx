import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Save, ExternalLink } from 'lucide-react';
import { useWPPost, useUpdateWPPost } from '../hooks/useQueries';

export default function WPEditPost() {
  const navigate = useNavigate();
  const { id }   = useParams<{ id: string }>();
  const postId   = parseInt(id || '0');

  const { data: post, isLoading, error } = useWPPost(postId);
  const updateMut = useUpdateWPPost();

  const [title,   setTitle]   = useState('');
  const [content, setContent] = useState('');
  const [status,  setStatus]  = useState<'publish' | 'draft' | 'pending'>('publish');
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    if (post) {
      setTitle(stripHtml(post.title?.rendered || ''));
      setContent(post.content?.rendered || '');
      setStatus(post.status || 'publish');
    }
  }, [post]);

  async function handleSave() {
    setSaved(false);
    try {
      await updateMut.mutateAsync({
        id: postId,
        payload: { title, content, status },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      alert('خطا در ذخیره: ' + (err.response?.data?.error || err.message));
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 pb-28" dir="rtl">
        <div className="h-8 bg-surface rounded animate-pulse mb-4" />
        <div className="h-12 bg-surface rounded-xl animate-pulse mb-3" />
        <div className="h-64 bg-surface rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="p-4 pb-28" dir="rtl">
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3">
          خطا در بارگذاری پست
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(-1)}
          className="text-label hover:text-white p-1.5 rounded-lg hover:bg-surface transition-colors">
          <ArrowRight size={20} />
        </button>
        <h1 className="text-white font-bold text-lg">ویرایش پست</h1>
        <button onClick={() => window.open(post.link, '_blank')}
          className="text-label hover:text-blue p-1.5 rounded-lg hover:bg-surface transition-colors">
          <ExternalLink size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-label text-xs mb-1.5 block">عنوان</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue"
          />
        </div>

        <div>
          <label className="text-label text-xs mb-1.5 block">محتوا (HTML)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            dir="auto"
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue font-mono text-sm leading-relaxed resize-y"
          />
        </div>

        <div>
          <label className="text-label text-xs mb-1.5 block">وضعیت</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue"
          >
            <option value="publish">منتشر شده</option>
            <option value="draft">پیش‌نویس</option>
            <option value="pending">در انتظار</option>
          </select>
        </div>

        {saved && (
          <div className="bg-success/10 border border-success/30 text-success text-sm rounded-xl px-4 py-3 text-center">
            ✓ تغییرات ذخیره شد
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={updateMut.isPending}
          className="w-full bg-blue hover:bg-blue-hover disabled:opacity-50 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <Save size={18} />
          {updateMut.isPending ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
        </button>
      </div>
    </div>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
