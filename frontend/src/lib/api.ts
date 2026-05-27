import type { Video, Series, TaxonomyTerm } from '@/types';

const WP = process.env.NEXT_PUBLIC_WP_API ?? 'https://persianatheists.com/wp-json';
const PAYS = `${WP}/pa-yt/v1`;
const WPV2 = `${WP}/wp/v2`;

const VIDEO_FIELDS = 'id,title,excerpt,date,link,featured_media,meta,_links';
const EMBED_PARAM  = '_embed=wp:featuredmedia,wp:term';

/* ─── fetch wrapper ─────────────────────────────────────────────────── */

async function wpFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate: 300 },
    ...opts,
  });
  if (!res.ok) throw new Error(`WP API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

/* ─── Normalise WP post → Video ──────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseVideo(p: any): Video {
  const meta    = p.meta ?? {};
  const embed   = p._embedded ?? {};
  const media   = embed['wp:featuredmedia']?.[0];
  const terms   = (embed['wp:term'] ?? []).flat() as TaxonomyTerm[];

  const ytId     = meta.pa_youtube_id ?? '';
  const thumb    = media?.source_url
    ?? (ytId ? `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg` : '');

  return {
    id:          p.id,
    title:       p.title?.rendered ?? '',
    ytId,
    thumbnail:   thumb,
    duration:    Number(meta.pa_duration_sec ?? 0),
    type:        (meta.pa_type as Video['type']) ?? 'video',
    channelId:   meta.pa_channel_id ?? '',
    date:        p.date ?? '',
    excerpt:     p.excerpt?.rendered?.replace(/<[^>]+>/g, '') ?? '',
    link:        p.link ?? '',
    content:     p.content?.rendered,
    series:      terms.filter((t) => t.taxonomy === 'pa_series').map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    topics:      terms.filter((t) => t.taxonomy === 'pa_topic').map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  };
}

/* ─── Videos ─────────────────────────────────────────────────────────── */

export async function getVideos(params: {
  page?: number;
  perPage?: number;
  search?: string;
  seriesId?: number;
  type?: 'video' | 'short';
} = {}): Promise<{ videos: Video[]; total: number }> {
  const { page = 1, perPage = 20, search, seriesId, type = 'video' } = params;
  const postType = type === 'short' ? 'pa_short' : 'pa_video';

  const qs = new URLSearchParams({
    page:        String(page),
    per_page:    String(perPage),
    _fields:     VIDEO_FIELDS,
    _embed:      'wp:featuredmedia,wp:term',
    orderby:     'date',
    order:       'desc',
  });
  if (search)   qs.set('search', search);
  if (seriesId) qs.set('pa_series', String(seriesId));

  const url  = `${WPV2}/${postType}?${qs}`;
  const res  = await fetch(url, { next: { revalidate: 300 } });
  const data = await res.json();
  const total = Number(res.headers.get('X-WP-Total') ?? 0);

  return {
    videos: Array.isArray(data) ? data.map(normaliseVideo) : [],
    total,
  };
}

export async function getShorts(page = 1, perPage = 20) {
  return getVideos({ page, perPage, type: 'short' });
}

export async function getVideo(id: number): Promise<Video | null> {
  try {
    const qs = new URLSearchParams({ _embed: 'wp:featuredmedia,wp:term' });
    const p  = await wpFetch<unknown>(`${WPV2}/pa_video/${id}?${qs}`);
    return normaliseVideo(p);
  } catch {
    try {
      const qs = new URLSearchParams({ _embed: 'wp:featuredmedia,wp:term' });
      const p  = await wpFetch<unknown>(`${WPV2}/pa_short/${id}?${qs}`);
      return normaliseVideo(p);
    } catch {
      return null;
    }
  }
}

export async function getFeaturedVideo(): Promise<Video | null> {
  const { videos } = await getVideos({ perPage: 1 });
  return videos[0] ?? null;
}

export async function searchVideos(query: string, page = 1) {
  const [videos, shorts] = await Promise.all([
    getVideos({ search: query, page }),
    getVideos({ search: query, page, type: 'short' }),
  ]);
  return {
    videos: [...videos.videos, ...shorts.videos],
    total:  videos.total + shorts.total,
  };
}

/* ─── Series ──────────────────────────────────────────────────────────── */

export async function getSeries(): Promise<Series[]> {
  try {
    const data = await wpFetch<{ id: number; name: string; slug: string; count: number; playlist_id?: string }[]>(
      `${PAYS}/series`
    );
    return data.map((t) => ({
      id:         t.id,
      name:       t.name,
      slug:       t.slug,
      count:      t.count,
      playlistId: t.playlist_id,
    }));
  } catch {
    return [];
  }
}

export async function getSeriesVideos(seriesId: number, perPage = 12) {
  return getVideos({ seriesId, perPage });
}

/* ─── Transcript ────────────────────────────────────────────────────── */

export async function getTranscript(ytId: string, lang = 'fa') {
  try {
    return await wpFetch<{ raw_text: string; timed_json: string }>(`${PAYS}/transcript/${ytId}?lang=${lang}`);
  } catch {
    return null;
  }
}

/* ─── Channels ──────────────────────────────────────────────────────── */

export async function getChannels() {
  try {
    return await wpFetch<{ id: string; name: string; thumbnail: string; enabled: boolean }[]>(`${PAYS}/channels`);
  } catch {
    return [];
  }
}
