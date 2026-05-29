import { Request, Response } from 'express';
import { randomUUID, createHash, createHmac } from 'crypto';
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

function pickAvatar(wpUser: any): string | null {
  // WP REST `/users/{id}` returns avatar_urls = { '24': url, '48': url, '96': url }
  // Some plugins return a `simple_local_avatar` { full } shape — try common keys.
  const sizes = wpUser.avatar_urls;
  if (sizes && typeof sizes === 'object') {
    return sizes['96'] || sizes['48'] || sizes['24'] || Object.values(sizes)[0] as string || null;
  }
  if (wpUser.avatar_url) return wpUser.avatar_url;
  if (wpUser.simple_local_avatar?.full) return wpUser.simple_local_avatar.full;
  return null;
}

async function upsertUser(wpUser: any, role: string): Promise<number> {
  const wpId        = wpUser.id ?? wpUser.ID ?? null;
  const username    = wpUser.slug ?? wpUser.user_login ?? null;
  const displayName = wpUser.name ?? wpUser.display_name ?? null;
  const email       = wpUser.email ?? wpUser.user_email ?? null;
  const avatarUrl   = pickAvatar(wpUser);

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM users WHERE wp_user_id = ?',
    [wpId]
  );

  if (existing) {
    await query(
      'UPDATE users SET display_name=?, email=?, role=?, avatar_url=?, updated_at=NOW() WHERE wp_user_id=?',
      [displayName, email, role, avatarUrl, wpId]
    );
    return existing.id;
  }

  return queryInsert(
    'INSERT INTO users (wp_user_id, username, display_name, email, role, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
    [wpId, username, displayName, email, role, avatarUrl]
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

      // Always fetch /users/{id} to enrich with roles + avatar_urls
      // (JWT plugin responses omit avatar_urls; some omit roles too)
      let roles: string[] = wpToken.user_roles ?? [];
      if (wpToken.token && wpId) {
        try {
          const meRes = await axios.get(
            `${config.wp.url}/wp-json/wp/v2/users/${wpId}?context=edit`,
            { headers: { Authorization: `Bearer ${wpToken.token}` }, timeout: 8000 }
          );
          if (!roles.length) roles = meRes.data?.roles ?? [];
          if (meRes.data?.avatar_urls) wpUser.avatar_urls = meRes.data.avatar_urls;
          if (meRes.data?.simple_local_avatar) wpUser.simple_local_avatar = meRes.data.simple_local_avatar;
          if (!wpUser.email && meRes.data?.email) wpUser.email = meRes.data.email;
          if (meRes.data?.name) wpUser.name = meRes.data.name;
        } catch { /* fall through */ }
      }
      if (roles.includes('administrator')) role = 'admin';
      else if (roles.includes('editor') || roles.includes('author') || roles.includes('contributor')) role = 'editor';
      else {
        // subscriber یا نقش‌های پایین‌تر — دسترسی به مینی‌اپ ندارند
        await dbLog('warn', 'auth', 'Login blocked: insufficient role', { username, roles });
        return res.status(403).json({ error: 'دسترسی به این بخش برای حساب شما مجاز نیست.' });
      }
    }

    if (!wpUser) {
      try {
        const meRes = await axios.get(`${config.wp.url}/wp-json/wp/v2/users/me?context=edit`, {
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          },
          timeout: 8000,
        });
        wpUser = meRes.data;
        const wpRoles: string[] = meRes.data.roles ?? [];
        if (wpRoles.includes('administrator')) role = 'admin';
        else if (wpRoles.includes('editor') || wpRoles.includes('author') || wpRoles.includes('contributor')) role = 'editor';
        else {
          await dbLog('warn', 'auth', 'Login blocked: insufficient role', { username, roles: wpRoles });
          return res.status(403).json({ error: 'دسترسی به این بخش برای حساب شما مجاز نیست.' });
        }
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
        avatarUrl:   pickAvatar(wpUser),
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

export async function loginWithTelegram(req: Request, res: Response) {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'initData الزامی است' });

  const botToken = config.telegram.botToken;
  if (!botToken) return res.status(503).json({ error: 'بات توکن تنظیم نشده' });

  // Validate HMAC per Telegram Mini App spec
  const params = new URLSearchParams(initData);
  const hash   = params.get('hash') || '';
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected  = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expected !== hash) return res.status(401).json({ error: 'امضای تلگرام نامعتبر است' });

  // Auth_date must be recent (within 24 h)
  const authDate = parseInt(params.get('auth_date') || '0');
  if (Date.now() / 1000 - authDate > 86400) {
    return res.status(401).json({ error: 'توکن تلگرام منقضی شده' });
  }

  const tgUser = JSON.parse(params.get('user') || '{}');
  if (!tgUser.id) return res.status(400).json({ error: 'اطلاعات کاربر تلگرام ناقص است' });

  // Look up by telegram_id or create a restricted viewer account
  let row = await queryOne<{ id: number; username: string; role: string; display_name: string; email: string; avatar_url: string | null }>(
    'SELECT id, username, role, display_name, email, avatar_url FROM users WHERE telegram_chat_id = ?',
    [tgUser.id]
  );

  if (!row) {
    const uname = tgUser.username || `tg_${tgUser.id}`;
    const byUsername = await queryOne<{ id: number; username: string; role: string; display_name: string; email: string; avatar_url: string | null }>(
      'SELECT id, username, role, display_name, email, avatar_url FROM users WHERE username = ?',
      [uname]
    );

    if (byUsername) {
      await query('UPDATE users SET telegram_chat_id=? WHERE id=?', [tgUser.id, byUsername.id]);
      row = byUsername;
    } else {
      const newId = await queryInsert(
        'INSERT INTO users (wp_user_id, username, display_name, email, role, telegram_chat_id) VALUES (0,?,?,?,?,?)',
        [uname, `${tgUser.first_name} ${tgUser.last_name || ''}`.trim(), '', 'editor', tgUser.id]
      );
      row = { id: newId, username: uname, role: 'editor', display_name: tgUser.first_name, email: '', avatar_url: null };
    }
  }

  const accessToken  = signAccessToken(row.id, 0, row.username, row.role);
  const refreshToken = await issueRefreshToken(row.id, req);

  await dbLog('info', 'auth', 'Telegram login', { telegramId: tgUser.id, username: row.username });

  return res.json({
    token: accessToken,
    refreshToken,
    user: {
      id:          row.id,
      wpUserId:    0,
      username:    row.username,
      displayName: row.display_name,
      email:       row.email,
      role:        row.role,
      avatarUrl:   row.avatar_url,
    },
  });
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
