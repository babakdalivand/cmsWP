'use client';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { getVideos, getShorts, getSeries, getSeriesVideos } from '@/lib/api';

/* ─── Latest videos with infinite scroll ──────────────────────────────── */

export function useInfiniteVideos(type: 'video' | 'short' = 'video', perPage = 20) {
  const getKey = (page: number) => [`/videos`, type, page + 1, perPage];

  const { data, size, setSize, isLoading, isValidating, error } = useSWRInfinite(
    getKey,
    ([, t, pg, pp]) => getVideos({ type: t as 'video' | 'short', page: pg as number, perPage: pp as number }),
    { revalidateFirstPage: false }
  );

  const videos  = data ? data.flatMap((d) => d.videos) : [];
  const total   = data?.[0]?.total ?? 0;
  const hasMore = videos.length < total;

  return {
    videos,
    total,
    hasMore,
    isLoading,
    isValidating,
    error,
    loadMore: () => setSize(size + 1),
  };
}

/* ─── Search ─────────────────────────────────────────────────────────── */

export function useSearchVideos(query: string, page = 1) {
  const { data, isLoading } = useSWR(
    query ? [`/search`, query, page] : null,
    ([, q, pg]) => getVideos({ search: q as string, page: pg as number }),
    { keepPreviousData: true }
  );
  return { results: data?.videos ?? [], total: data?.total ?? 0, isLoading };
}

/* ─── Series list ─────────────────────────────────────────────────────── */

export function useSeries() {
  const { data, isLoading } = useSWR('/series', getSeries);
  return { series: data ?? [], isLoading };
}

/* ─── Series videos ───────────────────────────────────────────────────── */

export function useSeriesVideos(seriesId: number | null, perPage = 12) {
  const { data, isLoading } = useSWR(
    seriesId ? [`/series-videos`, seriesId, perPage] : null,
    ([, id, pp]) => getSeriesVideos(id as number, pp as number)
  );
  return { videos: data?.videos ?? [], isLoading };
}

/* ─── Shorts with infinite scroll ───────────────────────────────────── */

export function useInfiniteShorts(perPage = 10) {
  const getKey = (page: number) => [`/shorts`, page + 1, perPage];
  const { data, size, setSize, isLoading } = useSWRInfinite(
    getKey,
    ([, pg, pp]) => getShorts(pg as number, pp as number),
    { revalidateFirstPage: false }
  );
  const shorts  = data ? data.flatMap((d) => d.videos) : [];
  const total   = data?.[0]?.total ?? 0;
  const hasMore = shorts.length < total;
  return { shorts, hasMore, isLoading, loadMore: () => setSize(size + 1) };
}
