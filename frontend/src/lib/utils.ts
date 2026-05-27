export function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRelativeDate(dateStr: string, locale = 'fa-IR'): string {
  const date = new Date(dateStr);
  const now  = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / 86_400_000);

  if (days === 0) return locale === 'fa-IR' ? 'امروز' : 'Today';
  if (days === 1) return locale === 'fa-IR' ? 'دیروز' : 'Yesterday';
  if (days < 7)   return locale === 'fa-IR' ? `${toPersianDigits(days)} روز پیش` : `${days} days ago`;
  if (days < 30)  {
    const w = Math.floor(days / 7);
    return locale === 'fa-IR' ? `${toPersianDigits(w)} هفته پیش` : `${w} weeks ago`;
  }
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return locale === 'fa-IR' ? `${toPersianDigits(mo)} ماه پیش` : `${mo} months ago`;
  }
  const yr = Math.floor(days / 365);
  return locale === 'fa-IR' ? `${toPersianDigits(yr)} سال پیش` : `${yr} years ago`;
}

export function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

export function progressPercent(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export function ytThumbnail(ytId: string, quality: 'default' | 'mq' | 'hq' | 'sd' | 'maxres' = 'hq') {
  return `https://i.ytimg.com/vi/${ytId}/${quality}default.jpg`;
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
