'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import type { Video } from '@/types';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useFavoritesStore } from '@/store/favorites';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import Link from 'next/link';

interface Props {
  shorts: Video[];
  hasMore: boolean;
  onLoadMore: () => void;
  isLoading?: boolean;
}

export function ShortsFeed({ shorts, hasMore, onLoadMore, isLoading }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);

  const sentinelRef = useIntersectionObserver(
    useCallback(() => { if (hasMore && !isLoading) onLoadMore(); }, [hasMore, isLoading, onLoadMore]),
    { threshold: 0.5 }
  );

  if (shorts.length === 0 && !isLoading) {
    return <div className="flex items-center justify-center h-screen text-neutral-400">شورتی پیدا نشد</div>;
  }

  return (
    <div className="shorts-feed">
      {shorts.map((short, idx) => (
        <ShortItem
          key={short.id}
          short={short}
          isActive={idx === activeIdx}
          onActivate={() => setActiveIdx(idx)}
        />
      ))}

      {/* Load more sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="short-item flex items-center justify-center h-screen">
          <div className="w-10 h-10 border-2 border-brand-light border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function ShortItem({ short, isActive, onActivate }: {
  short: Video;
  isActive: boolean;
  onActivate: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const isFav    = useFavoritesStore((s) => s.isFav(short.id));
  const toggleFav = useFavoritesStore((s) => s.toggle);

  // Auto-play when this item enters viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onActivate();
          setPlaying(true);
        } else {
          setPlaying(false);
        }
      },
      { threshold: 0.8 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onActivate]);

  return (
    <div
      ref={containerRef}
      className="short-item relative flex items-center justify-center h-screen w-full bg-black"
    >
      {/* Video / Thumbnail */}
      <div className="relative h-full max-h-screen aspect-[9/16] bg-black overflow-hidden">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${short.ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${short.ytId}&modestbranding=1&rel=0`}
            className="absolute inset-0 w-full h-full"
            allow="autoplay"
            title={short.title}
          />
        ) : (
          <Image
            src={short.thumbnail}
            alt={short.title}
            fill
            className="object-cover"
            sizes="100vw"
          />
        )}

        {/* Dark gradient at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

        {/* Info overlay */}
        <div className="absolute bottom-8 left-4 right-16 z-10">
          <Link href={`/watch/${short.id}`}>
            <h3 className="text-white font-bold text-base leading-snug line-clamp-2 mb-2">
              {short.title}
            </h3>
          </Link>
          {short.series?.[0] && (
            <span className="text-brand-light text-sm">{short.series[0].name}</span>
          )}
        </div>

        {/* Action buttons (right side) */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-5 z-10">

          {/* Favourite */}
          <ActionBtn
            onClick={() => toggleFav({ postId: short.id, ytId: short.ytId, title: short.title, thumbnail: short.thumbnail, type: short.type })}
            label={isFav ? 'حذف از لیست' : 'افزودن به لیست'}
            active={isFav}
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </ActionBtn>

          {/* Watch full */}
          <Link href={`/watch/${short.id}`}>
            <ActionBtn label="تماشا" as="div">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </ActionBtn>
          </Link>

          {/* Share */}
          <ActionBtn
            onClick={() => navigator.share?.({ title: short.title, url: short.link })}
            label="اشتراک‌گذاری"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  children, onClick, label, active, as: Tag = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  as?: 'button' | 'div';
}) {
  return (
    <Tag
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex flex-col items-center gap-1 text-white transition-transform active:scale-90',
        active && 'text-red-400'
      )}
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </Tag>
  );
}
