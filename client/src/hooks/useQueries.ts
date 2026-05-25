import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { api } from '../api/client';

// ── Query keys ────────────────────────────────────────────────────────────────
export const QK = {
  stats:      ['stats']      as const,
  quota:      ['quota']      as const,
  content:    (status: string) => ['content', status] as const,
  contentOne: (id: number)     => ['content', id]     as const,
  aiKeys:     ['aiKeys']     as const,
  aiJob:      (id: string)     => ['aiJob', id]        as const,
  wpCats:     ['wpCats']     as const,
  wpPosts:    (page: number, search: string) => ['wpPosts', page, search] as const,
  wpPost:     (id: number) => ['wpPost', id] as const,
  media:      (page: number)   => ['media', page]      as const,
  logs:       (level?: string) => ['logs', level]      as const,
  aiStats:    ['aiStats']    as const,
  users:      ['users']      as const,
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function useStats() {
  return useQuery({
    queryKey: QK.stats,
    queryFn:  () => api.get('/stats').then(r => r.data),
    staleTime: 30_000,
  });
}

export function useQuota() {
  return useQuery({
    queryKey: QK.quota,
    queryFn:  () => api.get('/ai/quota').then(r => r.data),
    staleTime: 60_000,
  });
}

// ── Content ───────────────────────────────────────────────────────────────────
export function useContentList(status: string) {
  return useQuery({
    queryKey: QK.content(status),
    queryFn:  () => api.get('/content', { params: { status } }).then(r => r.data),
    staleTime: 15_000,
  });
}

export function useContent(id: number, options?: UseQueryOptions<any>) {
  return useQuery({
    queryKey: QK.contentOne(id),
    queryFn:  () => api.get(`/content/${id}`).then(r => r.data),
    enabled: id > 0,
    ...options,
  });
}

export function useCreateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: object) => api.post('/content', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  });
}

export function useSubmitContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/content/${id}/submit`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content'] }),
  });
}

export function useApproveContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/content/${id}/approve`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: QK.stats });
    },
  });
}

export function useRejectContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      api.post(`/content/${id}/reject`, { note }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content'] });
      qc.invalidateQueries({ queryKey: QK.stats });
    },
  });
}

// ── AI (async job queue) ──────────────────────────────────────────────────────
export function usePostAIJob() {
  return useMutation({
    mutationFn: (payload: { provider: string; action: string; prompt: string }) =>
      api.post('/ai/job', payload).then(r => r.data as { jobId: string; status: string }),
  });
}

export function useAIJob(jobId: string | null) {
  return useQuery({
    queryKey: QK.aiJob(jobId ?? ''),
    queryFn:  () => api.get(`/ai/job/${jobId}`).then(r => r.data),
    enabled:  !!jobId,
    // Poll every 1.5 s while job is pending/processing
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return (status === 'pending' || status === 'processing') ? 1500 : false;
    },
    staleTime: 0,
  });
}

// ── AI keys ───────────────────────────────────────────────────────────────────
export function useAIKeys() {
  return useQuery({
    queryKey: QK.aiKeys,
    queryFn:  () => api.get('/ai/keys').then(r => r.data),
  });
}

export function useSaveAIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { provider: string; apiKey: string }) =>
      api.post('/ai/keys', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.aiKeys }),
  });
}

export function useDeleteAIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => api.delete(`/ai/keys/${provider}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.aiKeys }),
  });
}

// ── WordPress ──────────────────────────────────────────────────────────────────
export function useWPCategories() {
  return useQuery({
    queryKey: QK.wpCats,
    queryFn:  () => api.get('/wp/categories').then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useMedia(page = 1) {
  return useQuery({
    queryKey: QK.media(page),
    queryFn:  () => api.get('/wp/media', { params: { page, per_page: 20 } }).then(r => r.data),
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────
export function useComments(status: string = 'any', page = 1) {
  return useQuery({
    queryKey: ['comments', status, page],
    queryFn:  () => api.get('/wp/comments', { params: { status, page } }).then(r => r.data),
    staleTime: 15_000,
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      api.put(`/wp/comments/${id}`, payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force = false }: { id: number; force?: boolean }) =>
      api.delete(`/wp/comments/${id}`, { params: { force } }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });
}

export function useReplyComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      api.post(`/wp/comments/${id}/reply`, { content }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments'] }),
  });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      // Let axios add the multipart boundary itself — setting Content-Type
      // manually to "multipart/form-data" without a boundary breaks the upload.
      return api.post('/wp/media', fd).then(r => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });
}

export function useWPPosts(page = 1, search = '') {
  return useQuery({
    queryKey: QK.wpPosts(page, search),
    queryFn:  () => api.get('/wp/posts', { params: { page, per_page: 20, search: search || undefined } }).then(r => r.data),
    staleTime: 15_000,
  });
}

export function useWPPost(id: number) {
  return useQuery({
    queryKey: QK.wpPost(id),
    queryFn:  () => api.get(`/wp/posts/${id}`).then(r => r.data),
    enabled: id > 0,
  });
}

export function useUpdateWPPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      api.put(`/wp/posts/${id}`, payload).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: QK.wpPost(id) });
      qc.invalidateQueries({ queryKey: ['wpPosts'] });
    },
  });
}

export function useDeleteWPPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/wp/posts/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wpPosts'] }),
  });
}

// ── Monitoring ─────────────────────────────────────────────────────────────────
export function useLogs(level?: string) {
  return useQuery({
    queryKey: QK.logs(level),
    queryFn:  () => api.get('/monitoring/logs', { params: { level, limit: 50 } }).then(r => r.data),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAIStats() {
  return useQuery({
    queryKey: QK.aiStats,
    queryFn:  () => api.get('/monitoring/ai-stats').then(r => r.data),
    staleTime: 60_000,
  });
}

// ── Users ──────────────────────────────────────────────────────────────────────
export function useUsers() {
  return useQuery({
    queryKey: QK.users,
    queryFn:  () => api.get('/users').then(r => r.data),
  });
}
