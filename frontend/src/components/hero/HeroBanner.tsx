'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Video } from '@/types';
import { formatDuration, cn } from '@/lib/utils';
import { useFavoritesStore } from '@/store/favorites';

interface Props { video: Video }

export function HeroBanner({ video }: Props) {
  const [muted,   setMuted]   = useState(true);
  const [playing, setPlaying] = useState(false);
  const isFav    = useFavoritesStore((s) => s.isFav(video.id));
  const toggleFav = useFavoritesStore((s) => s.toggle);

  return (
    <section className="relative w-full aspect-[16/9] max-h-[80vh] overflow-hidden bg-black">

      {/* Backdrop image or YouTube iframe */}
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.ytId}?autoplay=1&${muted ? 'mute=1' : ''}&controls=0&modestbranding=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; fullscreen"
          title={video.title}
        />
      ) : (
        <Image
          src={video.thumbnail}
          alt={video.title}
          fill
          priority
          className="object-cover scale-105"
          sizes="100vw"
        />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute inset-0 hero-gradient-left" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="absolute bottom-8 right-4 md:right-12 left-4 md:left-auto md:w-1/2 z-10"
      >
        {/* Tags */}
        {video.topics && video.topics.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {video.topics.slice(0, 3).map((t) => (
              <span key={t.id} className="text-xs px-2.5 py-0.5 rounded-full bg-brand/30 border border-brand/40 text-brand-light font-medium">
                {t.name}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-3 drop-shadow-lg">
          {video.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-3 text-sm text-neutral-300 mb-4">
          {video.duration > 0 && (
            <span className="ltr font-mono">{formatDuration(video.duration)}</span>
          )}
          {video.series && video.series[0] && (
            <span className="text-brand-light">{video.series[0].name}</span>
          )}
        </div>

        {/* Description */}
        <p className="hidden md:block text-neutral-300 text-sm leading-relaxed line-clamp-3 mb-5 max-w-md">
          {video.excerpt}
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={`/watch/${video.id}`}
            className="flex items-center gap-2 px-6 py-2.5 bg-white text-black font-bold rounded-md hover:bg-neutral-200 transition-colors text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            پخش
          </Link>

          <button
            onClick={() => setPlaying(true)}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-md font-semibold text-sm transition-all',
              playing
                ? 'bg-brand text-white'
                : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/10'
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            پیش‌نمایش
          </button>

          <button
            onClick={() => toggleFav({ postId: video.id, ytId: video.ytId, title: video.title, thumbnail: video.thumbnail, type: video.type })}
            aria-label={isFav ? 'حذف از لیست' : 'افزودن به لیست'}
            className={cn(
              'w-10 h-10 rounded-full border flex items-center justify-center transition-all text-sm',
              isFav
                ? 'border-white bg-white/10 text-white'
                : 'border-white/40 hover:border-white text-white/70 hover:text-white'
            )}
          >
            {isFav ? '✓' : '+'}
          </button>

          {/* Mute/unmute (when playing) */}
          {playing && (
            <button
              onClick={() => setMuted((m) => !m)}
              className="w-10 h-10 rounded-full border border-white/40 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              aria-label={muted ? 'صدا' : 'بی‌صدا'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
          )}
        </div>
      </motion.div>
    </section>
  );
}

export function HeroBannerSkeleton() {
  return (
    <div className="relative w-full aspect-[16/9] max-h-[80vh] bg-surface-card">
      <div className="skeleton absolute inset-0" />
      <div className="absolute bottom-8 right-4 md:right-12 space-y-3">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="skeleton h-4 w-80 rounded" />
        <div className="flex gap-3 mt-4">
          <div className="skeleton h-10 w-24 rounded-md" />
          <div className="skeleton h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}
