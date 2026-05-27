'use client';
import { SWRConfig } from 'swr';
import { useInfiniteShorts } from '@/hooks/useVideos';
import { ShortsFeed } from '@/components/shorts/ShortsFeed';

function ShortsInner() {
  const { shorts, hasMore, isLoading, loadMore } = useInfiniteShorts(10);

  return (
    <ShortsFeed
      shorts={shorts}
      hasMore={hasMore}
      onLoadMore={loadMore}
      isLoading={isLoading}
    />
  );
}

export default function ShortsPage() {
  return (
    <SWRConfig value={{}}>
      <div className="h-screen overflow-hidden pt-0">
        <ShortsInner />
      </div>
    </SWRConfig>
  );
}
