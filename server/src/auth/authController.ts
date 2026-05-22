import { Request, Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { query, queryOne, queryInsert } from '../db/pool';
import { config } from '../config';
import { logger, dbLog } from '../monitoring/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function validateViaWPAPI(username: string, password: string) {
  try {
    const res = await axios.post(
      `${config.wp.url}/wp-json/jwt-auth/v1/token`,
      { username, password },
      { timeout: 8000 }
    );
    // Two known formats:
    //   Tmeister: { token, user_email, user_nicename, user_display_name, ... }
    //   Useful Team: { success, data: { token, id, email, displayName, ... } }
    const flat   = res.data?.token ? res.data : null;
    const nested = res.data?.data?.token ? res.data.data : null;
    return flat || nested;
  } catch {
    return null;
  }
}

async function upsertUser(wpUser: any, role: string): Promise<number> {
  const wpId        = wpUser.id ?? wpUser.ID ?? null;
  const username    = wpUser.slug ?? wpUser.user_login ?? null;
  const displayName = wpUser.name ?? wpUser.display_name ?? null;
  const email       = wpUser.email ?? wpUser.user_email ?? null;

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE wp_user_id = ?',
    [wpId]
  );

  if (existing) {
    await query(
      'UPDATE users SET display_name=?, email=?, updated_at=NOW() WHERE wp_user_id=?',
      [displayName, email, wpId]
    );
    return existing.id;
  }

  return queryInsert(
    'INSERT INTO users (wp_user_id, username, display_name, email, role) VALUES (?, ?, ?, ?, ?)',
    [wpId, username, displayName, email, role]
  );
}

async function issueRefreshToken(userId: number, req: Request): Promise<string> {
  const token      = randomUUID();
  const hash       = hashToken(token);
  const deviceInfo = req.headers['user-agent']?.slice(0, 200) ?? null;
  const ip         = req.ip ?? null;
  const expiresAt  = new Date(Date.now() + config.jwt.refreshExpiresMs);

  // Purge expired tokens for this user (housekeeping)
  await query(
    `DELETE FROM refresh_tokens WHERE user_id=? AND (expires_at < NOW() OR revoked=1)`,
    [userId]
  );

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, hash, deviceInfo, ip, expiresAt.toISOString().slice(0, 19).replace('T', ' ')]
  );

  return token;
}

function signAccessToken(userId: number, wpUserId: number, username: string, role: string): string {
  return jwt.sign(
    { userId, wpUserId, username, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  }

  try {
    const wpToken = await validateViaWPAPI(username, password);
    let wpUser: any = null;
    let role = 'editor';

    if (wpToken) {
      // Normalize across Tmeister and Useful Team JWT plugin formats
      const wpId   = wpToken.id ?? wpToken.user_id ?? null;
      const name   = wpToken.displayName ?? wpToken.user_display_name ?? wpToken.nicename ?? username;
      const email  = wpToken.email ?? wpToken.user_email ?? null;
      wpUser = wpId ? { id: wpId, name, email, slug: username } : null;
      role = wpToken.user_roles?.includes('administrator') ? 'admin' : 'editor';
    }

    if (!wpUser) {
      try {
        const meRes = await axios.get(`${config.wp.url}/wp-json/wp/v2/users/me`, {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          },
          timeout: 8000,
        });
        wpUser = meRes.data;
        role   = meRes.data.roles?.includes('administrator') ? 'admin' : 'editor';
      } catch {
        await dbLog('warn', 'auth', 'Login failed', { username });
        return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
      }
    }

    const userId      = await upsertUser(wpUser, role);
    const accessToken = signAccessToken(userId, wpUser.id, username, role);
    const refreshToken = await issueRefreshToken(userId, req);

    await dbLog('info', 'auth', 'Login success', { username, role });

    return res.json({
      token:        accessToken,
      refreshToken,
      user: {
        id:          userId,
        wpUserId:    wpUser.id,
        username,
        displayName: wpUser.name || wpUser.display_name,
        email:       wpUser.email,
        role,
        avatarUrl:   wpUser.avatar_urls?.['96'] || null,
      },
    });
  } catch (err: any) {
    console.error('❌ Login error:', err.message, err.stack);
    logger.error('Login error', { error: err.message });
    return res.status(500).json({ error: 'خطای سرور', detail: err.message });
  }
}

export async function refreshTokens(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'توکن بازیابی الزامی است' });

  const hash = hashToken(refreshToken);

  const row = await queryOne<{
    id: number; user_id: number; revoked: number; expires_at: string;
  }>(
    `SELECT id, user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash=?`,
    [hash]
  );

  if (!row)               return res.status(401).json({ error: 'توکن نامعتبر' });
  if (row.revoked)        return res.status(401).json({ error: 'توکن باطل شده' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(401).json({ error: 'توکن منقضی شده' });
  }

  // Rotate: revoke old token immediately
  await query(`UPDATE refresh_tokens SET revoked=1 WHERE id=?`, [row.id]);

  const user = await queryOne<{ wp_user_id: number; username: string; role: string }>(
    `SELECT wp_user_id, username, role FROM users WHERE id=?`,
    [row.user_id]
  );
  if (!user) return res.status(401).json({ error: 'کاربر یافت نشد' });

  const newAccessToken  = signAccessToken(row.user_id, user.wp_user_id, user.username, user.role);
  const newRefreshToken = await issueRefreshToken(row.user_id, req);

  await dbLog('info', 'auth', 'Tokens rotated', { userId: row.user_id });

  return res.json({ token: newAccessToken, refreshToken: newRefreshToken });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = req.body;

  if (refreshToken) {
    const hash = hashToken(refreshToken);
    await query(`UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?`, [hash]);
  }

  await dbLog('info', 'auth', 'Logout', { userId: (req as any).user?.userId });
  return res.json({ message: 'خروج موفق' });
}

export async function getMe(req: Request, res: Response) {
  const user = (req as any).user;
  const row  = await queryOne(
    'SELECT id, wp_user_id, username, display_name, email, role, avatar_url, created_at FROM users WHERE id=?',
    [user.userId]
  );
  if (!row) return res.status(404).json({ error: 'کاربر یافت نشد' });
  return res.json(row);
}
