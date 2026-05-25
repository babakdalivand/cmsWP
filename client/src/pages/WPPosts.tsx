import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Edit2, ExternalLink, Trash2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { useWPPosts, useDeleteWPPost } from '../hooks/useQueries';
import { useAuthStore } from '../store/authStore';

interface WPPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  status: string;
  date: string;
  link: string;
  raha_lang?: 'fa' | 'en';
  raha_translations?: Record<string, { id: number; link: string; title: string }>;
}

const LANG_FLAG: Record<string, string> = { fa: '🇮🇷', en: '🇬🇧' };

export default function WPPosts() {
  const navigate = useNavigate();
  const isAdmin  = useAuthStore(s => s.isAdmin());
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery]   = useState('');

  const { data, isLoading, error } = useWPPosts(page, query);
  const deleteMut = useDeleteWPPost();

  const posts: WPPost[] = data?.posts ?? [];
  const totalPages: number = data?.pages ?? 1;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search);
    setPage(1);
  }

  function handleDelete(id: number, title: string) {
    if (!confirm(`حذف پست «${stripHtml(title)}» — این عمل قابل بازگشت نیست. ادامه می‌دهید؟`)) return;
    deleteMut.mutate(id);
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-bold text-xl">محتوا</h1>
      </div>

      <div className="flex gap-2 mb-4 bg-surface border border-border rounded-xl p-1">
        <button
          onClick={() => navigate('/wp-posts')}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue text-white"
        >
          پست‌های سایت
        </button>
        <button
          onClick={() => navigate('/content')}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-label hover:text-white transition-colors"
        >
          محتوای داخلی
        </button>
      </div>

      <form onSubmit={handleSearch} className="relative mb-4">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-label" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو..."
          className="w-full bg-surface border border-border rounded-xl pr-9 pl-4 py-2.5 text-white placeholder-label text-sm focus:outline-none focus:border-blue"
        />
      </form>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">
          خطا در بارگذاری پست‌ها
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center text-label py-16">
          <FileText size={40} className="mx-auto mb-2 opacity-30" />
          <p>پستی یافت نشد</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map(post => (
            <div key={post.id} className="bg-surface border border-border rounded-xl p-4 hover:border-blue/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-white font-medium text-sm flex-1 leading-relaxed"
                   dangerouslySetInnerHTML={{ __html: post.title.rendered || 'بدون عنوان' }} />
                <div className="flex items-center gap-1 flex-shrink-0">
                  {post.raha_lang && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-blue/30 text-blue" title={post.raha_lang}>
                      {LANG_FLAG[post.raha_lang] || post.raha_lang}
                    </span>
                  )}
                  {post.raha_translations && Object.keys(post.raha_translations).length > 1 && (
                    <span className="text-[10px] text-label" title="ترجمه دارد">↔ {Object.keys(post.raha_translations).length}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    post.status === 'publish'
                      ? 'text-success border-success/30'
                      : 'text-label border-border'
                  }`}>
                    {post.status === 'publish' ? 'منتشر شده' : post.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-label text-xs">
                  {new Date(post.date).toLocaleDateString('fa-IR')}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.open(post.link, '_blank')}
                    className="text-label hover:text-blue p-1.5 rounded-lg hover:bg-blue/10 transition-colors"
                    title="مشاهده در سایت"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    onClick={() => navigate(`/wp-edit/${post.id}`)}
                    className="text-blue hover:text-blue-hover p-1.5 rounded-lg hover:bg-blue/10 transition-colors"
                    title="ویرایش"
                  >
                    <Edit2 size={15} />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(post.id, post.title.rendered)}
                      disabled={deleteMut.isPending}
                      className="text-danger p-1.5 rounded-lg hover:bg-danger/10 transition-colors disabled:opacity-40"
                      title="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="text-label disabled:opacity-30 hover:text-white p-2"
          >
            <ChevronRight size={18} />
          </button>
          <span className="text-label text-sm">صفحه {page} از {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="text-label disabled:opacity-30 hover:text-white p-2"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
