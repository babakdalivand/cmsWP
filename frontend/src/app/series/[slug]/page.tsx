import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSeries, getVideos } from '@/lib/api';
import { VideoCard } from '@/components/cards/VideoCard';
import type { Series } from '@/types';

export async function generateStaticParams() {
  const series = await getSeries().catch(() => [] as Series[]);
  return series.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await getSeries().catch(() => [] as Series[]);
  const found  = series.find((s) => s.slug === params.slug);
  return found ? { title: found.name } : { title: 'مجموعه' };
}

export default async function SeriesPage({ params }: Props) {
  const series = await getSeries().catch(() => [] as Series[]);
  const found  = series.find((s) => s.slug === params.slug);
  if (!found) notFound();

  const { videos } = await getVideos({ seriesId: found.id, perPage: 50 });

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{found.name}</h1>
        {found.description && (
          <p className="text-neutral-400 text-sm">{found.description}</p>
        )}
        <p className="text-neutral-500 text-sm mt-1">{found.count} ویدیو</p>
      </div>

      {videos.length === 0 ? (
        <p className="text-neutral-500">ویدیویی پیدا نشد</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {videos.map((v) => <VideoCard key={v.id} video={v} size="md" />)}
        </div>
      )}
    </div>
  );
}
