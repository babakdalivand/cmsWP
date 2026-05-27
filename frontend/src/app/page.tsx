import { Suspense } from 'react';
import { HeroBanner, HeroBannerSkeleton } from '@/components/hero/HeroBanner';
import { VideoRow } from '@/components/rows/VideoRow';
import { ContinueWatchingRow } from '@/components/rows/ContinueWatchingRow';
import { getFeaturedVideo, getVideos, getShorts, getSeries, getSeriesVideos } from '@/lib/api';
import type { Series } from '@/types';

export const revalidate = 300; // ISR — refresh every 5 min

async function HomeContent() {
  const [featured, newVideos, shorts, allSeries] = await Promise.all([
    getFeaturedVideo(),
    getVideos({ perPage: 16 }),
    getShorts(1, 10),
    getSeries(),
  ]);

  // Load videos for top 4 series in parallel
  const topSeries = allSeries.slice(0, 4);
  const seriesVideosList = await Promise.all(
    topSeries.map((s: Series) => getSeriesVideos(s.id, 10))
  );
  const seriesRows = topSeries.map((s: Series, i: number) => ({
    series: s,
    videos: seriesVideosList[i].videos,
  })).filter((r) => r.videos.length > 0);

  return (
    <>
      {/* Hero */}
      {featured && <HeroBanner video={featured} />}

      {/* Continue Watching — client-only (reads localStorage) */}
      <div className="mt-6">
        <ContinueWatchingRow />
      </div>

      {/* New Videos */}
      <VideoRow
        title="ویدیوهای جدید"
        videos={newVideos.videos}
        seeAllHref="/videos"
        size="md"
      />

      {/* Shorts preview */}
      {shorts.videos.length > 0 && (
        <VideoRow
          title="شورت‌های اخیر"
          videos={shorts.videos}
          seeAllHref="/shorts"
          size="sm"
        />
      )}

      {/* Series rows */}
      {seriesRows.map(({ series, videos }) => (
        <VideoRow
          key={series.id}
          title={series.name}
          videos={videos}
          seeAllHref={`/series/${series.slug}`}
          size="md"
        />
      ))}
    </>
  );
}

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      <Suspense fallback={<HeroBannerSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}
