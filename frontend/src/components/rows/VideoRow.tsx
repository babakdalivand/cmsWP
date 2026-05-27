'use client';
import { useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Video } from '@/types';
import { VideoCard, VideoCardSkeleton } from '@/components/cards/VideoCard';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  videos: Video[];
  isLoading?: boolean;
  seeAllHref?: string;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  skeletonCount?: number;
}

export function VideoRow({
  title, videos, isLoading = false,
  seeAllHref, size = 'md', showProgress = true, skeletonCount = 6,
}: Props) {
  const rowRef    = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(true);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = rowRef.current;
    if (!el) return;
    // RTL: scrollLeft is negative
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  }, []);

  const onScroll = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft < -8);
    setCanRight(el.scrollLeft > el.scrollWidth - el.clientWidth + 8);
  }, []);

  if (!isLoading && videos.length === 0) return null;

  return (
    <section className="relative group/row mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-4 md:px-8">
        <h2 className="text-base md:text-lg font-bold text-white">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-xs text-brand-light hover:text-brand font-medium transition-colors flex items-center gap-1"
          >
            مشاهده همه
            <svg className="w-3 h-3 rotate-180" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
        )}
      </div>

      {/* Scroll arrows */}
      <ArrowButton dir="right" visible={canLeft}  onClick={() => scroll('right')} />
      <ArrowButton dir="left"  visible={canRight} onClick={() => scroll('left')} />

      {/* Row */}
      <div
        ref={rowRef}
        onScroll={onScroll}
        className="scroll-row flex gap-3 px-4 md:px-8"
      >
        {isLoading
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <VideoCardSkeleton key={i} size={size} />
            ))
          : videos.map((v) => (
              <VideoCard key={v.id} video={v} size={size} showProgress={showProgress} />
            ))}
      </div>
    </section>
  );
}

function ArrowButton({ dir, visible, onClick }: {
  dir: 'left' | 'right';
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'left' ? 'بعدی' : 'قبلی'}
      className={cn(
        'absolute top-[calc(50%+16px)] -translate-y-1/2 z-10 w-9 h-20 flex items-center justify-center',
        'bg-black/60 text-white backdrop-blur-sm transition-all',
        'opacity-0 group-hover/row:opacity-100',
        !visible && 'pointer-events-none !opacity-0',
        dir === 'left'  ? 'left-0 rounded-r-md'  : 'right-0 rounded-l-md'
      )}
    >
      <svg className={cn('w-5 h-5', dir === 'right' && 'rotate-180')} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </button>
  );
}
