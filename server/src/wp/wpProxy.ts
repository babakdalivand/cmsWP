import axios, { AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { config } from '../config';

const WP_BASE   = `${config.wp.url}/wp-json/wp/v2`;
const RAHA_BASE = `${config.wp.url}/wp-json/raha/v1`;
const AUTH = Buffer.from(`${config.wp.apiUser}:${config.wp.apiPassword}`).toString('base64');

export async function wpRequest<T = any>(
  method: string,
  endpoint: string,
  data?: any,
  params?: Record<string, any>
): Promise<T> {
  const cfg: AxiosRequestConfig = {
    method,
    url: `${WP_BASE}${endpoint}`,
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    params,
    timeout: config.wp.url ? 12000 : 5000,
  };
  if (data) cfg.data = data;
  const res = await axios(cfg);
  return res.data as T;
}

export async function getPosts(params: Record<string, any> = {}) {
  const res = await axios.get(`${WP_BASE}/posts`, {
    headers: { Authorization: `Basic ${AUTH}` },
    params: { per_page: 20, ...params },
    timeout: 12000,
  });
  return {
    posts: res.data,
    total: parseInt(res.headers['x-wp-total'] || '0'),
    pages: parseInt(res.headers['x-wp-totalpages'] || '1'),
  };
}

export async function getCategories() {
  return wpRequest('GET', '/categories', null, { per_page: 100, hide_empty: false });
}

export async function createPost(data: Record<string, any>) {
  return wpRequest('POST', '/posts', data);
}

export async function updatePost(id: number, data: Record<string, any>) {
  return wpRequest('POST', `/posts/${id}`, data);
}

export async function deletePost(id: number) {
  return wpRequest('DELETE', `/posts/${id}`, null, { force: true });
}

export async function uploadMedia(fileBuffer: Buffer, filename: string, mimeType: string) {
  // ASCII-safe filename for Content-Disposition (RFC 5987 for the real name)
  const asciiName = filename.replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(filename);

  const fd = new FormData();
  fd.append('file', fileBuffer, { filename, contentType: mimeType });

  const res = await axios.post(`${WP_BASE}/media`, fd, {
    headers: {
      Authorization: `Basic ${AUTH}`,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      ...fd.getHeaders(),
    },
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return res.data;
}

export async function getMedia(params: Record<string, any> = {}) {
  const res = await axios.get(`${WP_BASE}/media`, {
    headers: { Authorization: `Basic ${AUTH}` },
    params: { per_page: 20, ...params },
    timeout: 12000,
  });
  return {
    media: res.data,
    total: parseInt(res.headers['x-wp-total'] || '0'),
  };
}

// ── RAHA Multilingual plugin endpoints ────────────────────────────────────────
export async function rahaLinkTranslation(posts: Record<string, number>):
  Promise<{ group_id: string; posts: Record<string, number> }>
{
  const res = await axios.post(`${RAHA_BASE}/link-translation`, { posts }, {
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return res.data;
}

export async function rahaGetTranslations(postId: number): Promise<Record<string, any>> {
  const res = await axios.get(`${RAHA_BASE}/translations/${postId}`, { timeout: 8000 });
  return res.data;
}
