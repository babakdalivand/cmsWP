'use client';
import { useCallback } from 'react';
import { useInfiniteVideos } from '@/hooks/useVideos';
import { VideoCard, VideoCardSkeleton } from '@/components/cards/VideoCard';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

export default function VideosPage() {
  const { videos, hasMore, isLoading, isValidating, loadMore } = useInfiniteVideos('video', 24);

  const sentinel = useIntersectionObserver(
    useCallback(() => { if (hasMore && !isValidating) loadMore(); }, [hasMore, isValidating, loadMore])
  );

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-8 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">همه ویدیوها</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {isLoading && videos.length === 0
          ? Array.from({ length: 24 }).map((_, i) => <VideoCardSkeleton key={i} />)
          : videos.map((v) => <VideoCard key={v.id} video={v} size="md" />)
        }
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinel} className="h-10 flex items-center justify-center mt-6">
        {isValidating && (
          <div className="w-8 h-8 border-2 border-brand-light border-t-transparent rounded-full animate-spin" />
        )}
        {!hasMore && videos.length > 0 && (
          <p className="text-neutral-600 text-sm">همه ویدیوها بارگذاری شدند</p>
        )}
      </div>
    </div>
  );
}
