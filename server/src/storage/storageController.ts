import { Request, Response } from 'express';
import axios from 'axios';
import { query } from '../db/pool';
import { config } from '../config';
import crypto from 'crypto';

// ── JWT generator (HS256) for cmsWP → WP plugin calls ────────────────────────
function makePluginJwt(siteKey: string, issuer: string, audience: string): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: issuer,
    aud: audience,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  })).toString('base64url');

  const sig = crypto
    .createHmac('sha256', siteKey)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${sig}`;
}

// ── DB: get site key for this WP install ─────────────────────────────────────
async function getSiteKey(): Promise<string | null> {
  const rows = await query('SELECT value FROM cmm_settings WHERE `key` = ? LIMIT 1', ['site_key'])
    .catch(() => null);
  return rows?.[0]?.value ?? (process.env.CMM_SITE_KEY || null);
}

// ── WP plugin REST proxy helper ───────────────────────────────────────────────
async function pluginRequest(
  method: string,
  path: string,
  data?: any,
  params?: any
): Promise<any> {
  const wpUrl   = config.wp.url;
  const siteKey = (await getSiteKey()) || process.env.CMM_SITE_KEY || '';

  if (!siteKey) throw new Error('CMM site key not configured. Set CMM_SITE_KEY in .env');

  const token = makePluginJwt(siteKey, wpUrl, wpUrl);
  const url   = `${wpUrl}/wp-json/cmm/v1${path}`;

  const res = await axios({ method, url, data, params, headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
  return res.data;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export async function getStatus(req: Request, res: Response) {
  try {
    const data = await pluginRequest('GET', '/status');
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getProviders(req: Request, res: Response) {
  try {
    const data = await pluginRequest('GET', '/providers');
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function addProvider(req: Request, res: Response) {
  try {
    const data = await pluginRequest('POST', '/providers', req.body);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteProvider(req: Request, res: Response) {
  try {
    const data = await pluginRequest('DELETE', `/providers/${req.params.id}`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function setDefaultProvider(req: Request, res: Response) {
  try {
    const data = await pluginRequest('POST', `/providers/${req.params.id}/default`);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getConfig(req: Request, res: Response) {
  try {
    const data = await pluginRequest('GET', '/config');
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function saveConfig(req: Request, res: Response) {
  try {
    const data = await pluginRequest('POST', '/config', req.body);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function triggerSync(req: Request, res: Response) {
  try {
    const data = await pluginRequest('POST', '/sync', req.body);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function getLogs(req: Request, res: Response) {
  try {
    const data = await pluginRequest('GET', '/logs', undefined, req.query);
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function saveSiteKey(req: Request, res: Response) {
  try {
    const { site_key } = req.body;
    if (!site_key) return res.status(400).json({ error: 'site_key required' });

    // Persist in DB for multi-instance support, fallback to env
    await query(
      'INSERT INTO cmm_settings (`key`, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=?',
      ['site_key', site_key, site_key]
    ).catch(() => {
      // Table may not exist — store in memory (env-only fallback)
      process.env.CMM_SITE_KEY = site_key;
    });

    res.json({ saved: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function testConnection(_req: Request, res: Response) {
  try {
    const data = await pluginRequest('GET', '/status');
    res.json({ ok: true, version: data.version, site: data.site });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
