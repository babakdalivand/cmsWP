const { apiBase, nonce } = window.paysAI || {};

async function apiFetch(path, opts = {}) {
  const res = await fetch(apiBase + path, {
    headers: {
      'Content-Type': 'application/json',
      'X-WP-Nonce': nonce,
      ...opts.headers,
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Channels
  getChannels: () => apiFetch('/channels'),

  // Queue
  getQueue: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/queue' + (q ? '?' + q : ''));
  },

  // Transcripts
  getTranscript: (ytId, lang = 'en') => apiFetch(`/transcript/${ytId}?lang=${lang}`),
  fetchTranscript: (ytId, lang = 'en') =>
    apiFetch(`/transcript/${ytId}/fetch`, {
      method: 'POST',
      body: JSON.stringify({ lang }),
    }),
  searchTranscripts: (q) => apiFetch(`/transcript/search?q=${encodeURIComponent(q)}`),

  // AI SEO
  getAI: (postId, lang = 'en') => apiFetch(`/ai/${postId}?lang=${lang}`),
  generateAI: (postId, ytId, lang) =>
    apiFetch(`/ai/${postId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ yt_id: ytId, lang }),
    }),
  applyAI: (postId, lang) =>
    apiFetch(`/ai/${postId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ lang }),
    }),

  // Settings
  getSettings: () => apiFetch('/settings'),
  saveSettings: (data) =>
    apiFetch('/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Posts (WP REST)
  getVideoPosts: () =>
    fetch(apiBase.replace('pa-yt/v1', 'wp/v2') + '/pa_video?per_page=50&_fields=id,title,meta', {
      headers: { 'X-WP-Nonce': nonce },
    }).then((r) => r.json()),

  // Article queue
  getArticleQueue: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/article-queue' + (q ? '?' + q : ''));
  },
  getArticleQueueCounts: () => apiFetch('/article-queue/counts'),
  queueArticle: (postId, ytId, lang, tone) =>
    apiFetch('/article-queue', {
      method: 'POST',
      body: JSON.stringify({ post_id: postId, yt_id: ytId, lang, tone }),
    }),
  retryArticle: (id) =>
    apiFetch(`/article-queue/${id}/retry`, { method: 'POST' }),
  deleteArticleJob: (id) =>
    apiFetch(`/article-queue/${id}`, { method: 'DELETE' }),

  // Article actions
  rewriteArticle: (postId, tone) =>
    apiFetch(`/article/${postId}/rewrite`, {
      method: 'POST',
      body: JSON.stringify({ tone }),
    }),
  getLinkSuggestions: (postId) => apiFetch(`/article/${postId}/links`),
  publishArticle: (postId) =>
    apiFetch(`/article/${postId}/publish`, { method: 'POST' }),

  // Series taxonomy
  getSeries: () => apiFetch('/series'),

  // Rules
  getRules: () => apiFetch('/rules'),
  getRule: (id) => apiFetch(`/rules/${id}`),
  createRule: (data) =>
    apiFetch('/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) =>
    apiFetch(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRule: (id) =>
    apiFetch(`/rules/${id}`, { method: 'DELETE' }),
  toggleRule: (id, enabled) =>
    apiFetch(`/rules/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),

  // Bulk moderation
  bulkModerate: (ids, action) =>
    apiFetch('/queue/bulk', { method: 'POST', body: JSON.stringify({ ids, action }) }),

  // Moderation log
  getModLog: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/mod-log' + (q ? '?' + q : ''));
  },

  // Telegram test
  testTelegram: () => apiFetch('/telegram/test', { method: 'POST' }),

  // Toxicity check
  checkToxicity: (title, description = '') =>
    apiFetch('/toxicity/check', { method: 'POST', body: JSON.stringify({ title, description }) }),
};
