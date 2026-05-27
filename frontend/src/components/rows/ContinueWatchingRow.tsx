'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useHistoryStore } from '@/store/history';
import type { WatchProgress } from '@/types';
import { formatDuration, cn } from '@/lib/utils';

export function ContinueWatchingRow() {
  const [items, setItems] = useState<WatchProgress[]>([]);
  const getContinue = useHistoryStore((s) => s.getContinueWatching);
  const remove      = useHistoryStore((s) => s.removeEntry);

  useEffect(() => {
    setItems(getContinue(20));
  }, [getContinue]);

  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-4 md:px-8">
        <h2 className="text-base md:text-lg font-bold text-white">ادامه تماشا</h2>
      </div>
      <div className="scroll-row flex gap-3 px-4 md:px-8">
        {items.map((item) => (
          <ContinueCard key={item.ytId} item={item} onRemove={() => {
            remove(item.ytId);
            setItems((prev) => prev.filter((i) => i.ytId !== item.ytId));
          }} />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ item, onRemove }: { item: WatchProgress; onRemove: () => void }) {
  const pct       = Math.round(item.progress * 100);
  const remaining = Math.round(item.duration * (1 - item.progress));

  return (
    <div className="relative flex-shrink-0 w-44 sm:w-52 group/card">
      <Link href={`/watch/${item.postId}?t=${Math.floor(item.progress * item.duration)}`} className="block">
        <div className="relative aspect-video rounded-md overflow-hidden bg-surface-card">
          <Image
            src={item.thumbnail}
            alt={item.title}
            fill
            className="object-cover"
            sizes="208px"
          />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-5 h-5 text-white mr-[-2px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* Progress bar */}
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
            <div className="h-full bg-brand-light" style={{ width: `${pct}%` }} />
          </div>
          {/* Remaining time */}
          <span className="absolute bottom-2 left-2 bg-black/80 text-white text-[10px] font-mono px-1.5 py-0.5 rounded ltr">
            {remaining > 0 ? `${formatDuration(remaining)} مانده` : ''}
          </span>
        </div>
        <p className="mt-2 text-xs text-neutral-200 line-clamp-2 leading-snug font-medium">
          {item.title}
        </p>
      </Link>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-1.5 left-1.5 z-10 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-neutral-400 hover:text-white transition-all opacity-0 group-hover/card:opacity-100 text-xs"
        aria-label="حذف از ادامه تماشا"
      >
        ✕
      </button>
    </div>
  );
}
