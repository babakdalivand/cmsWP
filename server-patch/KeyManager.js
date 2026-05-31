'use strict';
const { encrypt, decrypt } = require('./encryption');

let _db = null;
function db() {
  if (!_db) _db = require('../db/connection');
  return _db;
}

async function ensureTable() {
  // Use existing user_ai_keys table; add is_global column if missing
  try {
    await db().query(`ALTER TABLE user_ai_keys ADD COLUMN is_global TINYINT NOT NULL DEFAULT 0`);
  } catch (e) { /* column already exists */ }
  try {
    await db().query(`ALTER TABLE user_ai_keys MODIFY COLUMN user_id INT NULL`);
  } catch (e) { /* already nullable */ }
}

async function saveKey({ userId, provider, nickname = '', displayName, apiKey, customUrl, customModel, isGlobal = false }) {
  await ensureTable();
  const enc = encrypt(apiKey.trim());
  await db().query(`
    INSERT INTO user_ai_keys (user_id, provider, nickname, display_name, api_key_enc, custom_url, custom_model, is_global, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      api_key_enc  = VALUES(api_key_enc),
      display_name = VALUES(display_name),
      custom_url   = VALUES(custom_url),
      custom_model = VALUES(custom_model),
      is_global    = VALUES(is_global),
      is_active    = 1
  `, [userId, provider, nickname, displayName || null, enc, customUrl || null, customModel || null, isGlobal ? 1 : 0]);
}

async function deleteKey({ userId, provider, nickname = '' }) {
  await ensureTable();
  await db().query(
    'UPDATE user_ai_keys SET is_active=0 WHERE user_id=? AND provider=? AND nickname=? AND is_global=0',
    [userId, provider, nickname]
  );
}

async function deleteGlobalKey({ provider, nickname = '' }) {
  await ensureTable();
  await db().query(
    'UPDATE user_ai_keys SET is_active=0 WHERE provider=? AND nickname=? AND is_global=1',
    [provider, nickname]
  );
}

async function getKeyForRequest(userId, provider, nickname = '') {
  await ensureTable();
  // Priority: personal key → global key (is_global=1 OR user_id IS NULL) → .env key
  const [rows] = await db().query(
    `SELECT api_key_enc, custom_url, custom_model,
            COALESCE(is_global, 0) AS is_global, user_id
     FROM user_ai_keys
     WHERE provider=? AND nickname=? AND is_active=1
       AND (user_id=? OR COALESCE(is_global,0)=1 OR user_id IS NULL)
     ORDER BY (user_id=?) DESC, id DESC
     LIMIT 1`,
    [provider, nickname, userId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  try {
    return {
      key:          decrypt(row.api_key_enc),
      customUrl:    row.custom_url,
      customModel:  row.custom_model,
      isPersonal:   row.user_id === userId,
    };
  } catch { return null; }
}

async function listUserKeys(userId, isAdmin) {
  await ensureTable();
  const [rows] = await db().query(
    `SELECT provider, nickname, display_name, custom_url, custom_model,
            COALESCE(is_global, 0) AS is_global, user_id
     FROM user_ai_keys
     WHERE is_active=1
       AND (user_id=? OR (? = 1 AND (COALESCE(is_global,0)=1 OR user_id IS NULL)))
     ORDER BY COALESCE(is_global,0) DESC, provider, nickname`,
    [userId, isAdmin ? 1 : 0]
  );
  return rows;
}

module.exports = { saveKey, deleteKey, deleteGlobalKey, getKeyForRequest, listUserKeys, ensureTable };
