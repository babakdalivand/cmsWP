export interface Video {
  id: number;
  title: string;
  ytId: string;
  thumbnail: string;
  duration: number;       // seconds
  type: 'video' | 'short' | 'live';
  channelId: string;
  channelName?: string;
  date: string;
  excerpt: string;
  link: string;
  viewCount?: number;
  series?: TaxonomyTerm[];
  topics?: TaxonomyTerm[];
  content?: string;
}

export interface TaxonomyTerm {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

export interface Series extends TaxonomyTerm {
  playlistId?: string;
  thumbnail?: string;
  description?: string;
}

export interface WatchProgress {
  ytId: string;
  postId: number;
  title: string;
  thumbnail: string;
  progress: number;       // 0–1
  duration: number;       // seconds
  lastWatched: number;    // unix timestamp
}

export interface FavoriteItem {
  postId: number;
  ytId: string;
  title: string;
  thumbnail: string;
  type: Video['type'];
  addedAt: number;
}

export interface SearchResult {
  videos: Video[];
  total: number;
  hasMore: boolean;
}

export interface HomePageData {
  featured: Video | null;
  continueWatching: WatchProgress[];
  newVideos: Video[];
  shorts: Video[];
  seriesRows: { series: Series; videos: Video[] }[];
  trending: Video[];
}
