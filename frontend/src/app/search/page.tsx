'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearchVideos } from '@/hooks/useVideos';
import { VideoCard, VideoCardSkeleton } from '@/components/cards/VideoCard';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const initial      = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, total, isLoading } = useSearchVideos(initial);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [query, router]);

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-8 max-w-[1600px] mx-auto">

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3 max-w-xl">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی ویدیو..."
            autoFocus
            className="flex-1 bg-surface-card border border-surface-border rounded-full px-5 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-brand-light transition-colors"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-brand text-white rounded-full font-semibold hover:bg-brand-dark transition-colors"
          >
            جستجو
          </button>
        </div>
      </form>

      {/* Results */}
      {initial && (
        <>
          <div className="mb-4 text-neutral-400 text-sm">
            {isLoading
              ? 'در حال جستجو...'
              : `${total} نتیجه برای "${initial}"`}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => <VideoCardSkeleton key={i} size="md" />)
              : results.map((v) => (
                  <VideoCard key={v.id} video={v} size="md" />
                ))}
          </div>

          {!isLoading && results.length === 0 && (
            <div className="text-center py-24 text-neutral-500">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg">نتیجه‌ای برای «{initial}» پیدا نشد</p>
            </div>
          )}
        </>
      )}

      {!initial && (
        <div className="text-center py-24 text-neutral-500">
          <p className="text-5xl mb-4">🔍</p>
          <p>چیزی بنویسید تا ویدیوها را جستجو کنید</p>
        </div>
      )}
    </div>
  );
}
