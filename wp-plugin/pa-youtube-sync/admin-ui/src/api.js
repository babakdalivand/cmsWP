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
};
