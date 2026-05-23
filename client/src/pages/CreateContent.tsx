import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight, Sparkles, RotateCw, Search, Send, Clock,
  Upload, X, Image as ImageIcon, Film, Music, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateContent, useSubmitContent, usePostAIJob, useAIJob, useUploadMedia,
  useWPCategories,
} from '../hooks/useQueries';
import RichTextEditor from '../components/ui/RichTextEditor';

type Lang        = 'fa' | 'en' | 'both';
type ContentType = 'article' | 'youtube' | 'podcast' | 'media';
type AIProvider  = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'grok' | 'mistral' | 'custom';

const LANG_OPTIONS = [{ v: 'fa', l: '🇮🇷 فارسی' }, { v: 'en', l: '🇬🇧 English' }, { v: 'both', l: '🌐 دوزبانه' }];
const TYPE_OPTIONS = [
  { v: 'article', l: '📄 مقاله' },
  { v: 'youtube', l: '▶️ یوتیوب' },
  { v: 'podcast', l: '🎙️ پادکست' },
  { v: 'media',   l: '🖼 مدیا' },
];
const AI_PROVIDERS = ['gemini', 'openai', 'claude', 'deepseek', 'grok', 'mistral', 'custom'] as AIProvider[];

interface MediaInfo {
  id: number;
  url: string;
  type: string;
  filename: string;
}

export default function CreateContent() {
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────
  const [type, setType]         = useState<ContentType>('article');
  const [lang, setLang]         = useState<Lang>('fa');
  const [provider, setProvider] = useState<AIProvider>('gemini');

  const [form, setForm] = useState({
    title_fa: '', title_en: '',
    content_fa: '', content_en: '',
    youtube_url: '', podcast_url: '',
  });
  const [featured, setFeatured] = useState<MediaInfo | null>(null);  // featured image (always available)
  const [mediaFile, setMediaFile] = useState<MediaInfo | null>(null); // file for 'media' type
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState('');

  // Categories
  const { data: categories = [] } = useWPCategories();

  // ── AI job ───────────────────────────────────────────────────────────────
  const [aiJob, setAiJob] = useState<{ jobId: string; targetField: string } | null>(null);

  const createMut   = useCreateContent();
  const submitMut   = useSubmitContent();
  const postJobMut  = usePostAIJob();
  const uploadMut   = useUploadMedia();
  const { data: jobData } = useAIJob(aiJob?.jobId ?? null);

  // ── File input refs ─────────────────────────────────────────────────────
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef    = useRef<HTMLInputElement>(null);

  // Apply finished AI result
  useEffect(() => {
    if (!aiJob || !jobData) return;
    if (jobData.status === 'completed' && jobData.result) {
      setForm(f => ({ ...f, [aiJob.targetField]: jobData.result }));
      setAiJob(null);
    } else if (jobData.status === 'failed') {
      setError(jobData.error || 'خطای AI');
      setAiJob(null);
    }
  }, [jobData, aiJob]);

  function set(field: string, val: string) {
    setForm(f => ({ ...f, [field]: val }));
  }

  // ── AI handlers ─────────────────────────────────────────────────────────
  async function aiAction(action: string, targetField: string, prompt: string) {
    setError('');
    try {
      const { jobId } = await postJobMut.mutateAsync({ provider, action, prompt });
      setAiJob({ jobId, targetField });
    } catch (e: any) {
      setError(e.response?.data?.error || 'خطای AI');
    }
  }

  // ── File upload ─────────────────────────────────────────────────────────
  async function uploadAndSet(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (m: MediaInfo) => void,
    ref: React.RefObject<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    if (file.size > 20 * 1024 * 1024) {
      setError(`فایل خیلی بزرگ است (${(file.size / 1024 / 1024).toFixed(1)} MB). حداکثر 20 MB.`);
      if (ref.current) ref.current.value = '';
      return;
    }
    try {
      const result = await uploadMut.mutateAsync(file);
      setter({
        id: result.id,
        url: result.source_url,
        type: result.mime_type || file.type,
        filename: result.title?.rendered || file.name,
      });
    } catch (err: any) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.message;
      console.error('Upload error:', err.response || err);
      setError(`خطا در آپلود: ${detail}`);
    } finally {
      if (ref.current) ref.current.value = '';
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit(asDraft = true) {
    setError('');
    try {
      const payload: any = { content_type: type, lang, ...form };
      if (scheduledAt) payload.scheduled_at = new Date(scheduledAt).toISOString();
      // Featured media priority: explicit featured > inline media file
      payload.featured_media = featured?.id ?? mediaFile?.id ?? undefined;
      if (categoryIds.length) payload.categories = categoryIds;

      const { id } = await createMut.mutateAsync(payload);
      if (!asDraft && !scheduledAt) await submitMut.mutateAsync(id);
      navigate('/content');
    } catch (e: any) {
      setError(e.response?.data?.error || 'خطا در ذخیره');
    }
  }

  const aiLoading = !!aiJob || postJobMut.isPending;
  const saving    = createMut.isPending || submitMut.isPending;

  return (
    <div className="p-4 pb-32" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-label hover:text-text">
          <ChevronRight size={22} />
        </button>
        <h1 className="text-text font-bold text-lg">ایجاد پست جدید</h1>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">
          {error}
        </div>
      )}

      {/* AI job banner */}
      {aiJob && (
        <div className="bg-blue/10 border border-blue/30 text-blue text-sm rounded-xl p-3 mb-4 flex items-center gap-2">
          <span className="animate-spin">⟳</span>
          {jobData?.status === 'processing' ? 'هوش مصنوعی در حال نوشتن...' : 'در صف انتظار...'}
        </div>
      )}

      {/* ── 1. Featured Image (top of the funnel) ───────────────────── */}
      <Section title="تصویر شاخص" hint="اولین چیزی که خواننده می‌بیند">
        <input
          ref={featuredInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => uploadAndSet(e, setFeatured, featuredInputRef)}
          className="hidden"
        />
        {!featured ? (
          <button
            type="button"
            onClick={() => featuredInputRef.current?.click()}
            disabled={uploadMut.isPending}
            className="w-full border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-2 text-label hover:text-blue hover:border-blue/40 transition-colors disabled:opacity-50"
          >
            {uploadMut.isPending ? (
              <><span className="animate-spin text-2xl">⟳</span><span className="text-sm">در حال آپلود...</span></>
            ) : (
              <>
                <ImageIcon size={32} strokeWidth={1.5} />
                <span className="text-sm font-medium">انتخاب تصویر شاخص</span>
                <span className="text-xs opacity-70">حداکثر 20 MB</span>
              </>
            )}
          </button>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border border-border bg-bg">
            <img src={featured.url} alt={featured.filename} className="w-full max-h-72 object-cover" />
            <button
              type="button"
              onClick={() => setFeatured(null)}
              className="absolute top-2 right-2 bg-danger/90 text-white p-2 rounded-full hover:bg-danger transition-colors"
              title="حذف"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              onClick={() => featuredInputRef.current?.click()}
              className="absolute bottom-2 left-2 bg-bg/90 text-text border border-border px-3 py-1.5 rounded-lg text-xs hover:bg-bg transition-colors"
            >
              جایگزینی
            </button>
          </div>
        )}
      </Section>

      {/* ── 2. Type / Lang / AI provider ────────────────────────────── */}
      <Section title="نوع و زبان">
        <div className="flex flex-wrap gap-2 mb-3">
          {TYPE_OPTIONS.map(o => (
            <button key={o.v} onClick={() => setType(o.v as ContentType)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                type === o.v ? 'bg-blue text-white' : 'bg-bg border border-border text-label hover:text-text'
              }`}>
              {o.l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={lang} onChange={e => setLang(e.target.value as Lang)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-blue">
            {LANG_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select value={provider} onChange={e => setProvider(e.target.value as AIProvider)}
            className="bg-bg border border-border rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-blue">
            {AI_PROVIDERS.map(p => <option key={p} value={p}>AI: {p}</option>)}
          </select>
        </div>
      </Section>

      {/* ── 3. Persian Title + Content ──────────────────────────────── */}
      {(lang === 'fa' || lang === 'both') && (
        <Section title="🇮🇷 فارسی">
          <input value={form.title_fa} onChange={e => set('title_fa', e.target.value)}
            placeholder="عنوان فارسی" dir="rtl"
            className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-text placeholder-label text-sm focus:outline-none focus:border-blue mb-3" />

          {type === 'article' && (
            <>
              <RichTextEditor
                value={form.content_fa}
                onChange={(html) => set('content_fa', html)}
                placeholder="محتوای فارسی... — می‌توانید با AI تولید کنید"
                dir="rtl"
              />
              <AIButtons className="mt-3" loading={aiLoading} provider={provider}
                onContent={() => aiAction('content', 'content_fa', `یک مقاله جامع، روان و خوش‌خوان به زبان فارسی درباره موضوع زیر بنویس. خروجی را به صورت HTML ساده برگردان (با p, h2, h3, ul, ol, blockquote, a, strong, em). موضوع: ${form.title_fa}`)}
                onImprove={() => aiAction('improve', 'content_fa', `متن فارسی زیر را بهبود بده و روان‌تر کن. ساختار HTML را حفظ کن:\n\n${form.content_fa}`)}
                onSEO={() => aiAction('seo', 'content_fa', `یک متن SEO-friendly با meta description و کلمات کلیدی برای موضوع: ${form.title_fa}`)}
              />
            </>
          )}
        </Section>
      )}

      {/* ── 4. English Title + Content ──────────────────────────────── */}
      {(lang === 'en' || lang === 'both') && (
        <Section title="🇬🇧 English">
          <input value={form.title_en} onChange={e => set('title_en', e.target.value)}
            placeholder="English Title" dir="ltr"
            className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-text placeholder-label text-sm focus:outline-none focus:border-blue mb-3" />

          {type === 'article' && (
            <RichTextEditor
              value={form.content_en}
              onChange={(html) => set('content_en', html)}
              placeholder="English content..."
              dir="ltr"
            />
          )}
        </Section>
      )}

      {/* ── 5. YouTube ─────────────────────────────────────────────── */}
      {type === 'youtube' && (
        <Section title="لینک یوتیوب">
          <input value={form.youtube_url} onChange={e => set('youtube_url', e.target.value)}
            placeholder="https://youtube.com/watch?v=..." dir="ltr"
            className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-text placeholder-label text-sm focus:outline-none focus:border-blue" />
        </Section>
      )}

      {/* ── 6. Podcast ─────────────────────────────────────────────── */}
      {type === 'podcast' && (
        <Section title="لینک پادکست">
          <input value={form.podcast_url} onChange={e => set('podcast_url', e.target.value)}
            placeholder="https://..." dir="ltr"
            className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-text placeholder-label text-sm focus:outline-none focus:border-blue" />
        </Section>
      )}

      {/* ── 7. Media file (only when type = media) ──────────────── */}
      {type === 'media' && (
        <Section title="فایل ضمیمه" hint="عکس / ویدیو / صوت / PDF">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf"
            onChange={(e) => uploadAndSet(e, setMediaFile, mediaInputRef)}
            className="hidden"
          />
          {!mediaFile ? (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              disabled={uploadMut.isPending}
              className="w-full border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-2 text-label hover:text-blue hover:border-blue/40 transition-colors disabled:opacity-50"
            >
              {uploadMut.isPending ? (
                <><span className="animate-spin text-2xl">⟳</span><span className="text-sm">در حال آپلود...</span></>
              ) : (
                <><Upload size={32} strokeWidth={1.5} /><span className="text-sm font-medium">انتخاب فایل</span><span className="text-xs opacity-70">حداکثر 20 MB</span></>
              )}
            </button>
          ) : (
            <MediaPreview m={mediaFile} onRemove={() => setMediaFile(null)} onReplace={() => mediaInputRef.current?.click()} />
          )}
        </Section>
      )}

      {/* ── 8. Categories ───────────────────────────────────────────── */}
      <Section title="دسته‌بندی‌ها" hint={`${categoryIds.length} انتخاب شده`}>
        {categories.length === 0 ? (
          <p className="text-label text-xs">
            هنوز دسته‌بندی‌ای ساخته نشده. از صفحه{' '}
            <button type="button" onClick={() => navigate('/categories')} className="text-blue underline">
              دسته‌بندی‌ها
            </button>{' '}
            اضافه کنید.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c: any) => {
              const selected = categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setCategoryIds(ids =>
                      selected ? ids.filter(id => id !== c.id) : [...ids, c.id]
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    selected
                      ? 'bg-blue text-white border-blue'
                      : 'bg-bg text-label border-border hover:text-text hover:border-blue/40'
                  }`}
                >
                  {c.name}
                  {c.count > 0 && (
                    <span className="opacity-70 mr-1.5">({c.count})</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── 9. Schedule ─────────────────────────────────────────────── */}
      <Section>
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-label" />
          <label className="text-label text-xs">زمان‌بندی انتشار (اختیاری)</label>
        </div>
        <input
          type="datetime-local"
          value={scheduledAt}
          min={new Date().toISOString().slice(0, 16)}
          onChange={e => setScheduledAt(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text text-sm focus:outline-none focus:border-blue"
        />
      </Section>

      {/* ── Submit ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-20 left-0 right-0 px-4 flex gap-3 max-w-lg mx-auto">
        <button onClick={() => handleSubmit(true)} disabled={saving}
          className="flex-1 bg-surface border border-border text-text py-3.5 rounded-xl font-medium text-sm hover:border-blue/40 transition-colors disabled:opacity-50">
          ذخیره پیش‌نویس
        </button>
        <button onClick={() => handleSubmit(false)} disabled={saving}
          className="flex-1 bg-blue text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors disabled:opacity-50">
          {scheduledAt ? <Clock size={16} /> : <Send size={16} />}
          {saving ? 'در حال ذخیره...' : scheduledAt ? 'زمان‌بندی انتشار' : 'ارسال جهت بررسی'}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 mb-4">
      {title && (
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-text font-medium text-sm">{title}</h3>
          {hint && <span className="text-label text-[10px]">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function AIButtons({ loading, onContent, onImprove, onSEO, className = '' }: any) {
  const btn = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue/10 border border-blue/20 text-blue text-xs rounded-lg hover:bg-blue/20 transition-colors disabled:opacity-40">
      {loading ? <span className="animate-spin">⟳</span> : icon}
      {label}
    </button>
  );
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {btn('تولید متن', <Sparkles size={12} />, onContent)}
      {btn('بازنویسی',  <RotateCw size={12} />, onImprove)}
      {btn('سئو',       <Search size={12} />,   onSEO)}
    </div>
  );
}

function MediaPreview({
  m, onRemove, onReplace,
}: { m: MediaInfo; onRemove: () => void; onReplace: () => void }) {
  return (
    <div className="bg-bg border border-border rounded-xl p-3">
      {m.type.startsWith('image/') && (
        <img src={m.url} alt={m.filename} className="w-full max-h-64 object-contain rounded-lg mb-3" />
      )}
      {m.type.startsWith('video/') && (
        <video src={m.url} controls className="w-full max-h-64 rounded-lg mb-3" />
      )}
      {m.type.startsWith('audio/') && (
        <audio src={m.url} controls className="w-full mb-3" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {m.type.startsWith('image/') ? <ImageIcon size={16} className="text-blue" /> :
           m.type.startsWith('video/') ? <Film size={16} className="text-blue" /> :
           m.type.startsWith('audio/') ? <Music size={16} className="text-blue" /> :
           <FileText size={16} className="text-blue" />}
          <span className="text-text text-xs truncate" dangerouslySetInnerHTML={{ __html: m.filename }} />
        </div>
        <button type="button" onClick={onRemove}
          className="text-danger hover:bg-danger/10 p-1.5 rounded-lg flex-shrink-0">
          <X size={14} />
        </button>
      </div>
      <button type="button" onClick={onReplace}
        className="mt-2 w-full text-blue text-xs py-2 border border-blue/20 rounded-lg hover:bg-blue/10 transition-colors">
        جایگزینی فایل
      </button>
    </div>
  );
}
