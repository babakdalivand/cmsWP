import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BookOpen, Search, ChevronDown, ChevronUp, Sparkles,
  Upload, X, CheckCircle2, Loader2, ExternalLink, Download,
} from 'lucide-react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BookEntry {
  fileId:       string;
  fileName:     string;
  author:       string;
  sizeMb:       number;
  modifiedTime: string;
}

interface BookInfo {
  title:         string;
  subtitle:      string;
  authors:       string[];
  description:   string;
  publisher:     string;
  publishedDate: string;
  coverUrl:      string | null;
  isbn:          string | null;
  pageCount:     number | null;
  source:        string;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useDriveBooks() {
  return useQuery<{ books: BookEntry[] }>({
    queryKey: ['books', 'drive'],
    queryFn:  () => api.get('/books/list').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

function useFetchBookInfo() {
  return useMutation({
    mutationFn: (q: string) =>
      api.get<BookInfo>('/books/info', { params: { q } }).then(r => r.data),
  });
}

function usePublishBook() {
  return useMutation({
    mutationFn: (payload: object) => api.post('/books/publish', payload).then(r => r.data),
  });
}

// ── Helper: clean filename ─────────────────────────────────────────────────────

function cleanTitle(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim();
}

// ── Component: Book form sheet ─────────────────────────────────────────────────

function BookSheet({ book, onClose }: { book: BookEntry; onClose: () => void }) {
  const fetchInfo    = useFetchBookInfo();
  const publishBook  = usePublishBook();

  const [title,       setTitle]       = useState(cleanTitle(book.fileName));
  const [author,      setAuthor]      = useState(book.author || '');
  const [description, setDescription] = useState('');
  const [year,        setYear]        = useState('');
  const [publisher,   setPublisher]   = useState('');
  const [isbn,        setIsbn]        = useState('');
  const [pageCount,   setPageCount]   = useState('');
  const [coverUrl,    setCoverUrl]    = useState('');
  const [postStatus,  setPostStatus]  = useState<'publish' | 'draft'>('draft');
  const [result,      setResult]      = useState<{ postUrl: string; message: string } | null>(null);

  async function handleFetchInfo() {
    const q = [title, author].filter(Boolean).join(' ');
    const info = await fetchInfo.mutateAsync(q);
    if (info.title)         setTitle(info.title);
    if (info.authors?.[0])  setAuthor(info.authors.join(', '));
    if (info.description)   setDescription(info.description);
    if (info.publishedDate) setYear(info.publishedDate.slice(0, 4));
    if (info.publisher)     setPublisher(info.publisher);
    if (info.isbn)          setIsbn(info.isbn);
    if (info.pageCount)     setPageCount(String(info.pageCount));
    if (info.coverUrl)      setCoverUrl(info.coverUrl);
  }

  async function handlePublish() {
    const res = await publishBook.mutateAsync({
      title, author, description, year, publisher,
      cover_url:     coverUrl || null,
      drive_file_id: book.fileId,
      file_name:     book.fileName,
      isbn:          isbn || null,
      page_count:    pageCount ? parseInt(pageCount) : null,
      status:        postStatus,
    });
    setResult({ postUrl: res.postUrl, message: res.message });
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all';
  const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl pb-28"
        style={{ background: 'var(--surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="sticky top-0 z-10 px-5 pt-3 pb-2" style={{ background: 'var(--surface)' }}>
          <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--border)' }} />
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-black leading-tight" style={{ color: 'var(--text)' }}>
                {cleanTitle(book.fileName)}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--label)' }}>
                {book.author} · {book.sizeMb} MB
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full"
              style={{ background: 'var(--bg)', color: 'var(--label)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {result ? (
          <div className="px-5 py-6 text-center space-y-4">
            <CheckCircle2 size={48} className="mx-auto" style={{ color: 'var(--primary)' }} />
            <p className="font-bold" style={{ color: 'var(--text)' }}>{result.message}</p>
            <a
              href={result.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              <ExternalLink size={14} /> مشاهده در سایت
            </a>
            <button
              onClick={onClose}
              className="block w-full py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--bg)', color: 'var(--label)', border: '1px solid var(--border)' }}
            >
              بستن
            </button>
          </div>
        ) : (
          <div className="px-5 pt-1 space-y-4">
            {/* Auto-fetch */}
            <button
              onClick={handleFetchInfo}
              disabled={fetchInfo.isPending}
              className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity"
              style={{ background: 'rgba(79,184,180,0.12)', color: 'var(--primary)', border: '1px solid rgba(79,184,180,0.3)' }}
            >
              {fetchInfo.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              دریافت اطلاعات از اینترنت
              {fetchInfo.data?.source && (
                <span className="text-[10px] opacity-70">({fetchInfo.data.source})</span>
              )}
            </button>

            {/* Cover preview */}
            {coverUrl && (
              <div className="flex gap-3 items-start">
                <img
                  src={coverUrl}
                  alt="cover"
                  className="w-16 h-24 object-cover rounded-xl"
                  style={{ border: '1px solid var(--border)' }}
                  onError={() => setCoverUrl('')}
                />
                <div className="flex-1 space-y-2">
                  <input
                    className={inputCls}
                    style={inputStyle}
                    placeholder="URL تصویر جلد"
                    value={coverUrl}
                    onChange={e => setCoverUrl(e.target.value)}
                  />
                  <button
                    onClick={() => setCoverUrl('')}
                    className="text-[11px] px-2 py-1 rounded-lg"
                    style={{ background: 'var(--bg)', color: 'var(--label)' }}
                  >
                    حذف تصویر
                  </button>
                </div>
              </div>
            )}
            {!coverUrl && (
              <input
                className={inputCls}
                style={inputStyle}
                placeholder="URL تصویر جلد (اختیاری)"
                value={coverUrl}
                onChange={e => setCoverUrl(e.target.value)}
              />
            )}

            {/* Title */}
            <div>
              <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>عنوان کتاب *</label>
              <input className={inputCls} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} />
            </div>

            {/* Author */}
            <div>
              <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>نویسنده</label>
              <input className={inputCls} style={inputStyle} value={author} onChange={e => setAuthor(e.target.value)} />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>معرفی کتاب</label>
              <textarea
                className={inputCls}
                style={{ ...inputStyle, resize: 'none' }}
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="توضیحات و خلاصه کتاب..."
              />
            </div>

            {/* Year + Publisher */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>سال انتشار</label>
                <input className={inputCls} style={inputStyle} value={year} onChange={e => setYear(e.target.value)} placeholder="مثلاً 1401" />
              </div>
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>ناشر</label>
                <input className={inputCls} style={inputStyle} value={publisher} onChange={e => setPublisher(e.target.value)} />
              </div>
            </div>

            {/* ISBN + Pages */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>شابک / ISBN</label>
                <input className={inputCls} style={inputStyle} value={isbn} onChange={e => setIsbn(e.target.value)} />
              </div>
              <div>
                <label className="text-[11px] font-bold mb-1 block" style={{ color: 'var(--label)' }}>تعداد صفحات</label>
                <input className={inputCls} style={inputStyle} value={pageCount} onChange={e => setPageCount(e.target.value)} type="number" />
              </div>
            </div>

            {/* PDF info */}
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(79,184,180,0.08)', border: '1px solid rgba(79,184,180,0.2)' }}
            >
              <Download size={16} style={{ color: 'var(--primary)' }} />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: 'var(--text)' }}>{book.fileName}</p>
                <p className="text-[10px]" style={{ color: 'var(--label)' }}>{book.sizeMb} MB · Google Drive</p>
              </div>
            </div>

            {/* Status toggle */}
            <div className="flex gap-2">
              {(['draft', 'publish'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setPostStatus(s)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: postStatus === s ? 'var(--primary)' : 'var(--bg)',
                    color:      postStatus === s ? '#fff'           : 'var(--label)',
                    border:     '1px solid var(--border)',
                  }}
                >
                  {s === 'draft' ? '📝 پیش‌نویس' : '🌐 انتشار فوری'}
                </button>
              ))}
            </div>

            {/* Error */}
            {publishBook.isError && (
              <p className="text-xs text-red-400 text-center">
                {(publishBook.error as any)?.response?.data?.error || 'خطا در انتشار'}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={handlePublish}
              disabled={publishBook.isPending || !title.trim()}
              className="w-full py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{ background: 'var(--grad-primary)', color: '#fff', boxShadow: '0 6px 20px rgba(79,184,180,0.35)' }}
            >
              {publishBook.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {postStatus === 'publish' ? 'انتشار در سایت' : 'ذخیره پیش‌نویس'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Books() {
  const { data, isLoading, isError, refetch } = useDriveBooks();
  const [search,       setSearch]       = useState('');
  const [selectedBook, setSelectedBook] = useState<BookEntry | null>(null);
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());

  const books = data?.books || [];

  // Group by author
  const grouped = useMemo(() => {
    const filtered = books.filter(b => {
      if (!search) return true;
      const q = search.toLowerCase();
      return b.fileName.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
    });

    const map = new Map<string, BookEntry[]>();
    for (const b of filtered) {
      const key = b.author || 'سایر';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'fa'));
  }, [books, search]);

  function toggleGroup(author: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  }

  const totalBooks = books.length;
  const totalAuthors = new Set(books.map(b => b.author)).size;

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg)' }} dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={20} style={{ color: 'var(--primary)' }} />
            <h1 className="text-lg font-black" style={{ color: 'var(--text)' }}>کتابخانه</h1>
          </div>
          {!isLoading && (
            <div className="text-[11px]" style={{ color: 'var(--label)' }}>
              {totalBooks} کتاب · {totalAuthors} نویسنده
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--label)' }} />
          <input
            className="w-full pr-9 pl-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            placeholder="جستجو در کتاب‌ها و نویسندگان..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-3 space-y-2">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
            <p className="text-sm" style={{ color: 'var(--label)' }}>در حال بارگذاری از Google Drive...</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm" style={{ color: '#ef4444' }}>خطا در اتصال به Google Drive</p>
            <button
              onClick={() => refetch()}
              className="text-sm px-4 py-2 rounded-xl"
              style={{ background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--border)' }}
            >
              تلاش مجدد
            </button>
          </div>
        )}

        {!isLoading && !isError && grouped.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--label)' }}>کتابی یافت نشد</p>
          </div>
        )}

        {grouped.map(([author, authorBooks]) => {
          const isOpen = !collapsed.has(author);
          return (
            <div key={author} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {/* Group header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ background: 'var(--surface)' }}
                onClick={() => toggleGroup(author)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-black truncate" style={{ color: 'var(--text)' }}>
                    {author || 'سایر'}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: 'rgba(79,184,180,0.15)', color: 'var(--primary)' }}
                  >
                    {authorBooks.length}
                  </span>
                </div>
                {isOpen ? <ChevronUp size={15} style={{ color: 'var(--label)', flexShrink: 0 }} /> : <ChevronDown size={15} style={{ color: 'var(--label)', flexShrink: 0 }} />}
              </button>

              {/* Book list */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {authorBooks.map((book, idx) => (
                    <button
                      key={book.fileId}
                      className="w-full flex items-center gap-3 px-4 py-3 text-right transition-colors hover:opacity-80 active:opacity-60"
                      style={{
                        background:  'var(--bg)',
                        borderTop:   idx > 0 ? '1px solid var(--border)' : undefined,
                      }}
                      onClick={() => setSelectedBook(book)}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(79,184,180,0.1)' }}
                      >
                        <BookOpen size={14} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {cleanTitle(book.fileName)}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--label)' }}>
                          {book.sizeMb} MB
                        </p>
                      </div>
                      <ChevronDown size={14} className="-rotate-90" style={{ color: 'var(--label)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Book detail sheet */}
      {selectedBook && (
        <BookSheet book={selectedBook} onClose={() => setSelectedBook(null)} />
      )}
    </div>
  );
}
