'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import type { Video } from '@/types';
import { formatDuration, formatRelativeDate, cn, ytThumbnail } from '@/lib/utils';
import { useHistoryStore }   from '@/store/history';
import { useFavoritesStore } from '@/store/favorites';

interface Props {
  video: Video;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  showChannel?: boolean;
}

export function VideoCard({ video, size = 'md', showProgress = true, showChannel = false }: Props) {
  const [hovered,    setHovered]    = useState(false);
  const [imgError,   setImgError]   = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = useHistoryStore((s) => s.getProgress(video.ytId));
  const isFav    = useFavoritesStore((s) => s.isFav(video.id));
  const toggleFav = useFavoritesStore((s) => s.toggle);

  const onMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(true), 600);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
  }, []);

  const handleFav = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFav({ postId: video.id, ytId: video.ytId, title: video.title, thumbnail: video.thumbnail, type: video.type });
  }, [toggleFav, video]);

  const sizes = {
    sm: 'w-36 sm:w-44',
    md: 'w-44 sm:w-52 md:w-56',
    lg: 'w-52 sm:w-64 md:w-72',
  };

  const thumbnail = imgError ? ytThumbnail(video.ytId, 'sd') : (video.thumbnail || ytThumbnail(video.ytId, 'hq'));
  const pct = progress ? Math.round(progress.progress * 100) : 0;

  return (
    <div
      className={cn('video-card relative flex-shrink-0 cursor-pointer', sizes[size])}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Link href={`/watch/${video.id}`} className="block group">

        {/* Thumbnail */}
        <div className="relative aspect-video rounded-md overflow-hidden bg-surface-card">
          <Image
            src={thumbnail}
            alt={video.title}
            fill
            sizes="(max-width:640px) 140px, (max-width:768px) 208px, 224px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />

          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white mr-[-2px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          {/* Duration badge */}
          {video.duration > 0 && (
            <span className="absolute bottom-1.5 left-1.5 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded ltr">
              {formatDuration(video.duration)}
            </span>
          )}

          {/* Type badge */}
          {video.type === 'short' && (
            <span className="absolute top-1.5 right-1.5 bg-brand/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
              SHORT
            </span>
          )}
          {video.type === 'live' && (
            <span className="absolute top-1.5 right-1.5 bg-red-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}

          {/* Hover preview iframe */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 hover-preview z-10"
              >
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video.ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${video.ytId}&start=15&modestbranding=1`}
                  className="w-full h-full"
                  allow="autoplay"
                  title={video.title}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress bar */}
          {showProgress && pct > 5 && pct < 95 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
              <div
                className="h-full bg-brand-light"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-2 px-0.5">
          <h3 className={cn(
            'font-medium text-neutral-100 line-clamp-2 leading-snug',
            size === 'sm' ? 'text-xs' : 'text-sm'
          )}>
            {video.title}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[11px] text-neutral-500">{formatRelativeDate(video.date)}</p>
            {showChannel && video.channelName && (
              <p className="text-[11px] text-neutral-500 truncate">{video.channelName}</p>
            )}
          </div>
        </div>
      </Link>

      {/* Favourite button */}
      <button
        onClick={handleFav}
        aria-label={isFav ? 'حذف از لیست' : 'افزودن به لیست'}
        className={cn(
          'absolute top-2 right-2 z-20 w-7 h-7 rounded-full flex items-center justify-center',
          'bg-black/60 backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100',
          isFav ? 'text-red-500 opacity-100' : 'text-white hover:text-red-400'
        )}
        style={{ opacity: isFav ? 1 : undefined }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

export function VideoCardSkeleton({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-36 sm:w-44', md: 'w-44 sm:w-52 md:w-56', lg: 'w-52 sm:w-64 md:w-72' };
  return (
    <div className={cn('flex-shrink-0', sizes[size])}>
      <div className="skeleton aspect-video rounded-md" />
      <div className="mt-2 space-y-1.5">
        <div className="skeleton h-3.5 rounded w-full" />
        <div className="skeleton h-3 rounded w-2/3" />
      </div>
    </div>
  );
}
