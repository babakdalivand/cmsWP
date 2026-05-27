'use client';
import { useFavoritesStore } from '@/store/favorites';
import { VideoCard } from '@/components/cards/VideoCard';
import type { Video } from '@/types';

export default function FavoritesPage() {
  const items     = useFavoritesStore((s) => s.items);
  const clearAll  = useFavoritesStore((s) => s.clear);

  const asVideos: Video[] = items.map((i) => ({
    id:        i.postId,
    title:     i.title,
    ytId:      i.ytId,
    thumbnail: i.thumbnail,
    type:      i.type,
    duration:  0,
    channelId: '',
    date:      new Date(i.addedAt).toISOString(),
    excerpt:   '',
    link:      `/watch/${i.postId}`,
  }));

  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-8 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">❤️ لیست من</h1>
        {items.length > 0 && (
          <button
            onClick={clearAll}
            className="text-sm text-neutral-500 hover:text-white transition-colors"
          >
            پاک کردن همه
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-24 text-neutral-500">
          <p className="text-5xl mb-4">❤️</p>
          <p className="text-lg">لیست شما خالی است</p>
          <p className="text-sm mt-2">روی آیکون قلب روی ویدیوها کلیک کنید تا اینجا اضافه شوند</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {asVideos.map((v) => <VideoCard key={v.id} video={v} size="md" showProgress={false} />)}
        </div>
      )}
    </div>
  );
}
