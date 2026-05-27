import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getVideo, getVideos } from '@/lib/api';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { VideoRow } from '@/components/rows/VideoRow';
import { formatDuration, formatRelativeDate } from '@/lib/utils';

// Static export: pre-render the 150 most recent videos at build time
export async function generateStaticParams() {
  const [videos, shorts] = await Promise.allSettled([
    getVideos({ perPage: 100 }),
    getVideos({ perPage: 50, type: 'short' }),
  ]);
  const all = [
    ...(videos.status === 'fulfilled' ? videos.value.videos : []),
    ...(shorts.status === 'fulfilled' ? shorts.value.videos : []),
  ];
  return all.map((v) => ({ id: String(v.id) }));
}

export const dynamicParams = false;

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const video = await getVideo(Number(params.id));
  if (!video) return { title: 'ویدیو یافت نشد' };
  return {
    title:       video.title,
    description: video.excerpt?.slice(0, 160),
    openGraph: {
      title:       video.title,
      description: video.excerpt?.slice(0, 160),
      images:      [{ url: video.thumbnail, width: 1280, height: 720 }],
      type:        'video.other',
    },
  };
}

export default async function WatchPage({ params }: Props) {
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [video, related] = await Promise.all([
    getVideo(id),
    getVideos({ perPage: 12 }),
  ]);

  if (!video) notFound();

  const filteredRelated = related.videos.filter((v) => v.id !== video.id);

  const schema = {
    '@context': 'https://schema.org',
    '@type':    'VideoObject',
    name:        video.title,
    description: video.excerpt,
    thumbnailUrl: video.thumbnail,
    uploadDate:  video.date,
    duration:    video.duration ? `PT${Math.floor(video.duration / 60)}M${video.duration % 60}S` : undefined,
    embedUrl:    `https://www.youtube.com/embed/${video.ytId}`,
    contentUrl:  `https://www.youtube.com/watch?v=${video.ytId}`,
  };

  return (
    <div className="min-h-screen pt-14 md:pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6">
        <div className="flex flex-col xl:flex-row gap-8">

          {/* Player + info */}
          <div className="flex-1 min-w-0">
            <VideoPlayer video={video} autoPlay />

            <div className="mt-4 space-y-3">
              <h1 className="text-xl md:text-2xl font-bold text-white leading-snug">
                {video.title}
              </h1>

              <div className="flex items-center flex-wrap gap-3 text-sm text-neutral-400">
                {video.duration > 0 && (
                  <span className="ltr font-mono">⏱ {formatDuration(video.duration)}</span>
                )}
                <span>📅 {formatRelativeDate(video.date)}</span>
                {video.series?.[0] && (
                  <a href={`/watch/series/${video.series[0].slug}/`}
                    className="text-brand-light hover:underline">
                    📂 {video.series[0].name}
                  </a>
                )}
              </div>

              {video.topics && video.topics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {video.topics.map((t) => (
                    <span key={t.id}
                      className="text-xs px-2.5 py-1 rounded-full bg-surface-card border border-surface-border text-neutral-300">
                      {t.name}
                    </span>
                  ))}
                </div>
              )}

              {video.excerpt && (
                <div className="bg-surface-card rounded-xl p-4 text-sm text-neutral-300 leading-relaxed border border-surface-border">
                  <p>{video.excerpt}</p>
                </div>
              )}

              <a
                href={`https://www.youtube.com/watch?v=${video.ytId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                <span className="text-red-500">▶</span>
                مشاهده در یوتیوب
              </a>
            </div>
          </div>

          {/* Sidebar — desktop */}
          <div className="hidden xl:block w-80 flex-shrink-0">
            <h2 className="text-base font-bold text-white mb-4">ویدیوهای مرتبط</h2>
            <div className="space-y-4">
              {filteredRelated.slice(0, 10).map((v) => (
                <a key={v.id} href={`/watch/${v.id}/`} className="flex gap-3 group">
                  <div className="relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden bg-surface-card">
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {v.duration > 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] font-mono bg-black/80 text-white px-1 rounded ltr">
                        {formatDuration(v.duration)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-200 line-clamp-2 group-hover:text-white transition-colors leading-snug">
                      {v.title}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">{formatRelativeDate(v.date)}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:hidden mt-8">
          <VideoRow title="ویدیوهای مرتبط" videos={filteredRelated} size="sm" />
        </div>
      </div>
    </div>
  );
}
