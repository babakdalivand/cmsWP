import { Suspense } from 'react';
import Link from 'next/link';
import { getSeries } from '@/lib/api';

async function SeriesList() {
  const series = await getSeries();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {series.map((s) => (
        <Link
          key={s.id}
          href={`/series/${s.slug}`}
          className="group bg-surface-card hover:bg-surface-hover border border-surface-border rounded-xl p-5 transition-all hover:border-brand/40"
        >
          <div className="text-3xl mb-3">📂</div>
          <h2 className="font-bold text-white text-sm group-hover:text-brand-light transition-colors line-clamp-2">
            {s.name}
          </h2>
          <p className="text-xs text-neutral-500 mt-2">{s.count} ویدیو</p>
        </Link>
      ))}
    </div>
  );
}

export default function SeriesIndexPage() {
  return (
    <div className="min-h-screen pt-20 pb-8 px-4 md:px-8 max-w-[1600px] mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">مجموعه‌ها</h1>
      <Suspense fallback={
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      }>
        <SeriesList />
      </Suspense>
    </div>
  );
}
