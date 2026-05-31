import axios from 'axios';
import crypto from 'crypto';
import { query } from '../db/pool';
import { config } from '../config';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BookEntry {
  fileId:       string;
  fileName:     string;
  author:       string;
  sizeMb:       number;
  modifiedTime: string;
}

// ── Credential decryption (AES-256-GCM, WP-derived key) ───────────────────────

function deriveKey(): Buffer {
  return Buffer.from(config.wp.cmmKeyHex, 'hex');
}

function aesGcmDecrypt(b64: string, key: Buffer): string {
  const raw = Buffer.from(b64, 'base64');
  const iv  = raw.slice(0, 12);
  const tag = raw.slice(12, 28);
  const ct  = raw.slice(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
}

// ── Google OAuth2 (service account JWT flow) ──────────────────────────────────

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;

  const now     = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(privateKey, 'base64url');

  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${header}.${payload}.${sig}`,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  tokenCache = { token: res.data.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return tokenCache.token;
}

// ── Drive credentials (cached from DB) ────────────────────────────────────────

interface DriveCredentials { clientEmail: string; privateKey: string; folderId: string; }
let credCache: DriveCredentials | null = null;

async function getCredentials(): Promise<DriveCredentials> {
  if (credCache) return credCache;

  const rows = await query<{ credentials: string }>(
    "SELECT credentials FROM wp_cmm_providers WHERE type='gdrive' AND is_active=1 LIMIT 1", []
  );
  if (!rows.length) throw new Error('No Google Drive provider configured');

  const key = deriveKey();
  const enc = JSON.parse(rows[0].credentials);

  const clientEmail = aesGcmDecrypt(enc.client_email, key);
  const folderId    = aesGcmDecrypt(enc.folder_id,    key);
  const pkRaw       = aesGcmDecrypt(enc.private_key,  key);
  const privateKey  = JSON.parse(pkRaw);

  credCache = { clientEmail, privateKey, folderId };
  return credCache;
}

// ── Drive API helpers ─────────────────────────────────────────────────────────

async function driveList(folderId: string): Promise<any[]> {
  const { clientEmail, privateKey } = await getCredentials();
  const token = await getAccessToken(clientEmail, privateKey);

  let all: any[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      q:        `'${folderId}' in parents and trashed=false`,
      fields:   'nextPageToken,files(id,name,mimeType,size,modifiedTime)',
      pageSize: '200',
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
      params,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    all = all.concat(res.data.files || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return all;
}

// ── Public: list all books ─────────────────────────────────────────────────────

async function collectPdfs(folderId: string, author: string, out: BookEntry[], depth = 0) {
  if (depth > 3) return;
  const items = await driveList(folderId);

  for (const item of items) {
    if (item.mimeType === 'application/pdf') {
      out.push({
        fileId:       item.id,
        fileName:     item.name,
        author,
        sizeMb:       Math.round((parseInt(item.size || '0') / 1024 / 1024) * 10) / 10,
        modifiedTime: item.modifiedTime || '',
      });
    } else if (item.mimeType === 'application/vnd.google-apps.folder') {
      await collectPdfs(item.id, item.name, out, depth + 1);
    }
  }
}

export async function listBooks(): Promise<BookEntry[]> {
  const { folderId } = await getCredentials();
  const top = await driveList(folderId);

  const booksFolder = top.find(
    f => f.name === 'books' && f.mimeType === 'application/vnd.google-apps.folder'
  );
  const rootId = booksFolder ? booksFolder.id : folderId;

  const entries: BookEntry[] = [];
  await collectPdfs(rootId, '', entries);
  return entries;
}

// ── Public: stream a file from Drive ──────────────────────────────────────────

export async function streamDriveFile(fileId: string) {
  const { clientEmail, privateKey } = await getCredentials();
  const token = await getAccessToken(clientEmail, privateKey);

  const meta = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    params:  { fields: 'name,mimeType,size' },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  const stream = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    params:       { alt: 'media' },
    headers:      { Authorization: `Bearer ${token}` },
    responseType: 'stream',
    timeout:      120000,
  });

  return {
    stream:   stream.data,
    mimeType: meta.data.mimeType as string,
    fileName: meta.data.name    as string,
    size:     meta.data.size    as string | undefined,
  };
}
