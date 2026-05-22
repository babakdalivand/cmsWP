import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Sparkles, RotateCw, Search, Send, Clock, Upload, X, FileText, Image as ImageIcon, Film, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreateContent, useSubmitContent, usePostAIJob, useAIJob, useUploadMedia } from '../hooks/useQueries';

type Lang        = 'fa' | 'en' | 'both';
type ContentType = 'article' | 'youtube' | 'podcast' | 'media';
type AIProvider  = 'gemini' | 'openai' | 'claude' | 'deepseek' | 'grok' | 'mistral';

const LANG_OPTIONS = [{ v: 'fa', l: '🇮🇷 فارسی' }, { v: 'en', l: '🇬🇧 English' }, { v: 'both', l: '🌐 Bilingual' }];
const TYPE_OPTIONS = [{ v: 'article', l: 'مقاله' }, { v: 'youtube', l: 'یوتیوب' }, { v: 'podcast', l: 'پادکست' }, { v: 'media', l: 'مدیا' }];
const AI_PROVIDERS = ['gemini', 'openai', 'claude', 'deepseek', 'grok', 'mistral'] as AIProvider[];

export default function CreateContent() {
  const navigate = useNavigate();
  const [lang, setLang]     = useState<Lang>('fa');
  const [type, setType]     = useState<ContentType>('article');
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [form, setForm]     = useState({ title_fa: '', title_en: '', content_fa: '', content_en: '', youtube_url: '', podcast_url: '' });
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError]   = useState('');
  const [mediaFile, setMediaFile] = useState<{ id: number; url: string; type: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMut = useUploadMedia();

  // AI job tracking: { jobId, targetField }
  const [aiJob, setAiJob] = useState<{ jobId: string; targetField: string } | null>(null);

  const createMut  = useCreateContent();
  const submitMut  = useSubmitContent();
  const postJobMut = usePostAIJob();

  // Poll job until complete
  const { data: jobData } = useAIJob(aiJob?.jobId ?? null);

  // When job completes, apply result to the target field
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

  function set(field: string, val: string) { setForm(f => ({ ...f, [field]: val })); }

  async function aiAction(action: string, targetField: string, prompt: string) {
    setError('');
    try {
      const { jobId } = await postJobMut.mutateAsync({ provider, action, prompt });
      setAiJob({ jobId, targetField });
    } catch (e: any) {
      setError(e.response?.data?.error || 'خطای AI');
    }
  }

  async function handleSubmit(asDraft = true) {
    setError('');
    try {
      const payload: any = { content_type: type, lang, ...form };
      if (scheduledAt) payload.scheduled_at = new Date(scheduledAt).toISOString();
      if (mediaFile)   payload.featured_media = mediaFile.id;

      const { id } = await createMut.mutateAsync(payload);
      if (!asDraft && !scheduledAt) await submitMut.mutateAsync(id);
      navigate('/content');
    } catch (e: any) {
      setError(e.response?.data?.error || 'خطا در ذخیره');
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const result = await uploadMut.mutateAsync(file);
      setMediaFile({
        id: result.id,
        url: result.source_url,
        type: result.mime_type || file.type,
        filename: result.title?.rendered || file.name,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'خطا در آپلود فایل');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const aiLoading = !!aiJob || postJobMut.isPending;
  const saving    = createMut.isPending || submitMut.isPending;

  return (
    <div className="p-4 pb-32" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-label"><ChevronRight size={22} /></button>
        <h1 className="text-white font-bold text-lg">ایجاد پست جدید</h1>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl p-3 mb-4">{error}</div>
      )}

      {/* AI job status banner */}
      {aiJob && (
        <div className="bg-blue/10 border border-blue/30 text-blue text-sm rounded-xl p-3 mb-4 flex items-center gap-2">
          <span className="animate-spin">⟳</span>
          {jobData?.status === 'processing' ? 'هوش مصنوعی در حال نوشتن...' : 'در صف انتظار...'}
        </div>
      )}

      {/* Type & Lang */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4 flex flex-col gap-3">
        <div>
          <label className="text-label text-xs mb-2 block">نوع محتوا</label>
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map(o => (
              <button key={o.v} onClick={() => setType(o.v as ContentType)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${type === o.v ? 'bg-blue text-white' : 'bg-border text-label hover:text-white'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-label text-xs mb-2 block">زبان</label>
          <select value={lang} onChange={e => setLang(e.target.value as Lang)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue">
            {LANG_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label text-xs mb-2 block">پروایدر AI</label>
          <select value={provider} onChange={e => setProvider(e.target.value as AIProvider)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue">
            {AI_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-4">
        {/* FA Fields */}
        {(lang === 'fa' || lang === 'both') && (
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-label font-medium">🇮🇷 فارسی</div>
            <input value={form.title_fa} onChange={e => set('title_fa', e.target.value)}
              placeholder="عنوان فارسی" dir="rtl"
              className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue" />
            {type === 'article' && (
              <textarea value={form.content_fa} onChange={e => set('content_fa', e.target.value)}
                placeholder="محتوای فارسی..." dir="rtl" rows={5}
                className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue resize-none" />
            )}
            <AIButtons loading={aiLoading} provider={provider}
              onContent={() => aiAction('content', 'content_fa', `مقاله فارسی درباره: ${form.title_fa}`)}
              onImprove={() => aiAction('improve', 'content_fa', `بهبود متن فارسی:\n${form.content_fa}`)}
              onSEO={() => aiAction('seo', 'content_fa', `SEO برای: ${form.title_fa}`)}
            />
          </div>
        )}

        {/* EN Fields */}
        {(lang === 'en' || lang === 'both') && (
          <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-label font-medium">🇬🇧 English</div>
            <input value={form.title_en} onChange={e => set('title_en', e.target.value)}
              placeholder="English Title" dir="ltr"
              className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue" />
            {type === 'article' && (
              <textarea value={form.content_en} onChange={e => set('content_en', e.target.value)}
                placeholder="English content..." dir="ltr" rows={5}
                className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue resize-none" />
            )}
          </div>
        )}

        {/* YouTube */}
        {type === 'youtube' && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <label className="text-label text-xs mb-2 block">لینک یوتیوب</label>
            <input value={form.youtube_url} onChange={e => set('youtube_url', e.target.value)}
              placeholder="https://youtube.com/watch?v=..." dir="ltr"
              className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue" />
          </div>
        )}

        {/* Podcast */}
        {type === 'podcast' && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <label className="text-label text-xs mb-2 block">لینک پادکست</label>
            <input value={form.podcast_url} onChange={e => set('podcast_url', e.target.value)}
              placeholder="https://..." dir="ltr"
              className="w-full bg-bg border border-border rounded-lg px-3 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue" />
          </div>
        )}

        {/* Media upload */}
        {type === 'media' && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <label className="text-label text-xs mb-3 block">آپلود فایل (عکس، ویدیو، صدا، PDF)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {!mediaFile ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMut.isPending}
                className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2 text-label hover:text-blue hover:border-blue/40 transition-colors disabled:opacity-50"
              >
                {uploadMut.isPending ? (
                  <>
                    <span className="animate-spin text-2xl">⟳</span>
                    <span className="text-sm">در حال آپلود...</span>
                  </>
                ) : (
                  <>
                    <Upload size={32} strokeWidth={1.5} />
                    <span className="text-sm font-medium">انتخاب فایل</span>
                    <span className="text-xs opacity-70">حداکثر 20 مگابایت</span>
                  </>
                )}
              </button>
            ) : (
              <div className="bg-bg border border-border rounded-xl p-3">
                {mediaFile.type.startsWith('image/') && (
                  <img src={mediaFile.url} alt={mediaFile.filename}
                       className="w-full max-h-64 object-contain rounded-lg mb-3" />
                )}
                {mediaFile.type.startsWith('video/') && (
                  <video src={mediaFile.url} controls
                         className="w-full max-h-64 rounded-lg mb-3" />
                )}
                {mediaFile.type.startsWith('audio/') && (
                  <audio src={mediaFile.url} controls className="w-full mb-3" />
                )}

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {mediaFile.type.startsWith('image/') ? <ImageIcon size={16} className="text-blue flex-shrink-0" /> :
                     mediaFile.type.startsWith('video/') ? <Film size={16} className="text-blue flex-shrink-0" /> :
                     mediaFile.type.startsWith('audio/') ? <Music size={16} className="text-blue flex-shrink-0" /> :
                     <FileText size={16} className="text-blue flex-shrink-0" />}
                    <span className="text-white text-xs truncate" title={mediaFile.filename}
                          dangerouslySetInnerHTML={{ __html: mediaFile.filename }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMediaFile(null)}
                    className="text-danger hover:bg-danger/10 p-1.5 rounded-lg flex-shrink-0"
                    title="حذف"
                  >
                    <X size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full text-blue text-xs py-2 border border-blue/20 rounded-lg hover:bg-blue/10 transition-colors"
                >
                  جایگزینی فایل
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scheduled publish */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-label" />
            <label className="text-label text-xs">زمان‌بندی انتشار (اختیاری)</label>
          </div>
          <input
            type="datetime-local"
            value={scheduledAt}
            min={new Date().toISOString().slice(0, 16)}
            onChange={e => setScheduledAt(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue"
          />
          {scheduledAt && (
            <p className="text-blue text-xs mt-1.5 flex items-center gap-1">
              <Clock size={10} /> انتشار خودکار در زمان تعیین‌شده
            </p>
          )}
        </div>
      </div>

      {/* Submit buttons */}
      <div className="fixed bottom-20 left-0 right-0 px-4 flex gap-3">
        <button onClick={() => handleSubmit(true)} disabled={saving}
          className="flex-1 bg-surface border border-border text-white py-3.5 rounded-xl font-medium text-sm hover:border-blue/40 transition-colors disabled:opacity-50">
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

function AIButtons({ loading, onContent, onImprove, onSEO }: any) {
  const btn = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button onClick={onClick} disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue/10 border border-blue/20 text-blue text-xs rounded-lg hover:bg-blue/20 transition-colors disabled:opacity-40">
      {loading ? <span className="animate-spin">⟳</span> : icon}
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {btn('تولید متن', <Sparkles size={12} />, onContent)}
      {btn('بازنویسی',  <RotateCw size={12} />, onImprove)}
      {btn('سئو',       <Search size={12} />,   onSEO)}
    </div>
  );
}
