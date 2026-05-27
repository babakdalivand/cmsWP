import { Request, Response } from 'express';
import { wpRequest } from '../wp/wpProxy';
import { dbLog } from '../monitoring/logger';

const YT_BASE = '/pa-yt/v1';

async function ytApi(method: string, path: string, data?: any) {
  return wpRequest(method, path, data, undefined, YT_BASE);
}

export async function listChannels(_req: Request, res: Response) {
  try { res.json(await ytApi('GET', '/channels')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function addChannel(req: Request, res: Response) {
  try {
    const result = await ytApi('POST', '/channels', {
      channel_input: req.body.channel_input,
      lang:          req.body.lang        || 'fa',
      max_videos:    req.body.max_videos  || 20,
    });
    res.status(201).json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function updateChannel(req: Request, res: Response) {
  try {
    const result = await ytApi('PATCH', `/channels/${req.params.id}`, req.body);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function deleteChannel(req: Request, res: Response) {
  try {
    await ytApi('DELETE', `/channels/${req.params.id}`);
    res.status(204).end();
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function listQueue(req: Request, res: Response) {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const result = await ytApi('GET', `/queue?status=${status}&limit=${limit}&offset=${offset}`);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function approveVideo(req: Request, res: Response) {
  const adminId = (req as any).user.userId;
  try {
    const result = await ytApi('POST', `/queue/${req.params.id}/approve`, req.body);
    await dbLog('info', 'youtube', 'Video approved', { adminId, queueId: req.params.id, ...result });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function rejectVideo(req: Request, res: Response) {
  const adminId = (req as any).user.userId;
  try {
    await ytApi('POST', `/queue/${req.params.id}/reject`);
    await dbLog('info', 'youtube', 'Video rejected', { adminId, queueId: req.params.id });
    res.status(204).end();
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function listPlaylists(req: Request, res: Response) {
  try { res.json(await ytApi('GET', `/channels/${req.params.id}/playlists`)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function importPlaylist(req: Request, res: Response) {
  try {
    const result = await ytApi('POST', `/playlists/${req.params.pl_id}/import`, {
      channel_id: req.body.channel_id,
      max:        req.body.max || 50,
    });
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAnalytics(req: Request, res: Response) {
  try {
    const { limit = 20 } = req.query;
    res.json(await ytApi('GET', `/analytics?limit=${limit}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function runSync(_req: Request, res: Response) {
  try { res.json(await ytApi('POST', '/sync')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getSettings(_req: Request, res: Response) {
  try { res.json(await ytApi('GET', '/settings')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function saveSettings(req: Request, res: Response) {
  try { res.json(await ytApi('PATCH', '/settings', req.body)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function reclassifyQueue(_req: Request, res: Response) {
  try { res.json(await ytApi('POST', '/queue/reclassify')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getLiveStats(req: Request, res: Response) {
  try {
    const channel_id = req.query.channel_id as string || '';
    res.json(await ytApi('GET', `/youtube/live-stats${channel_id ? '?channel_id=' + channel_id : ''}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAdvancedAnalytics(req: Request, res: Response) {
  try {
    const { channel_id = '' } = req.query;
    const qs = channel_id ? `?channel_id=${encodeURIComponent(String(channel_id))}` : '';
    res.json(await ytApi('GET', `/analytics/advanced${qs}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAnalyticsTrends(req: Request, res: Response) {
  try {
    const { channel_id = '', days = 30 } = req.query;
    const qs = new URLSearchParams({ ...(channel_id ? { channel_id: String(channel_id) } : {}), days: String(days) });
    res.json(await ytApi('GET', `/analytics/trends?${qs}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAnalyticsBestTimes(req: Request, res: Response) {
  try {
    const { channel_id = '' } = req.query;
    const qs = channel_id ? `?channel_id=${encodeURIComponent(String(channel_id))}` : '';
    res.json(await ytApi('GET', `/analytics/best-times${qs}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function getAnalyticsReport(req: Request, res: Response) {
  try {
    const { channel_id = '' } = req.query;
    const qs = channel_id ? `?channel_id=${encodeURIComponent(String(channel_id))}` : '';
    res.json(await ytApi('GET', `/analytics/report${qs}`));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
}

export async function triggerAnalyticsSnapshot(_req: Request, res: Response) {
  try { res.json(await ytApi('POST', '/analytics/snapshot')); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
}
