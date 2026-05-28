import { pool } from './pool';
import { Pool } from 'mysql2/promise';

const tableSql = [
  `CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    wp_user_id      INT UNIQUE NOT NULL,
    username        VARCHAR(100) NOT NULL,
    display_name    VARCHAR(200),
    email           VARCHAR(200),
    role            VARCHAR(50) DEFAULT 'editor',
    avatar_url      TEXT,
    is_active       TINYINT(1) DEFAULT 1,
    telegram_chat_id BIGINT NULL UNIQUE,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_ai_keys (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    provider     VARCHAR(50) NOT NULL,
    api_key_enc  TEXT NOT NULL,
    is_active    TINYINT(1) DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_provider (user_id, provider),
    CONSTRAINT fk_aikeys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_usage (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    provider     VARCHAR(50) NOT NULL,
    model        VARCHAR(100),
    action       VARCHAR(100),
    tokens_in    INT DEFAULT 0,
    tokens_out   INT DEFAULT 0,
    used_own_key TINYINT(1) DEFAULT 0,
    used_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_aiusage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS ai_jobs (
    id         VARCHAR(36) PRIMARY KEY,
    user_id    INT NOT NULL,
    queue      VARCHAR(50) NOT NULL,
    status     ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    input      JSON NOT NULL,
    result     LONGTEXT,
    error      TEXT,
    attempts   INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_aijobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS content_staging (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT,
    wp_post_id     INT,
    content_type   VARCHAR(50) DEFAULT 'article',
    lang           VARCHAR(20) DEFAULT 'fa',
    title_fa       TEXT,
    title_en       TEXT,
    content_fa     LONGTEXT,
    content_en     LONGTEXT,
    excerpt_fa     TEXT,
    excerpt_en     TEXT,
    youtube_url    TEXT,
    podcast_url    TEXT,
    embed_provider VARCHAR(50),
    featured_media INT,
    categories     JSON,
    status         VARCHAR(30) DEFAULT 'draft',
    approval_note  TEXT,
    approved_by    INT,
    approved_at    DATETIME,
    scheduled_at   DATETIME,
    published_at   DATETIME,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_content_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_content_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    device_info VARCHAR(200),
    ip          VARCHAR(45),
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS system_logs (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    level      VARCHAR(20) NOT NULL,
    source     VARCHAR(50),
    message    TEXT NOT NULL,
    meta       JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Backfill schema changes for installs that pre-date a column addition.
// MySQL doesn't support ADD COLUMN IF NOT EXISTS — ignore 1060 (ER_DUP_FIELDNAME).
const alterSql = [
  `ALTER TABLE users ADD COLUMN telegram_chat_id BIGINT NULL UNIQUE`,
  `ALTER TABLE user_ai_keys ADD COLUMN custom_url VARCHAR(500) NULL`,
  `ALTER TABLE user_ai_keys ADD COLUMN custom_model VARCHAR(200) NULL`,
  `ALTER TABLE user_ai_keys ADD COLUMN nickname VARCHAR(100) NOT NULL DEFAULT ''`,
  `ALTER TABLE user_ai_keys ADD COLUMN display_name VARCHAR(150) NULL`,
  `ALTER TABLE user_ai_keys ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 0`,
  `ALTER TABLE user_ai_keys MODIFY COLUMN user_id INT NULL`,
];

// Unique-key migration: switch from (user_id, provider) to (user_id, provider, nickname)
// MySQL doesn't let DROP INDEX IF EXISTS until 8.0.29, so wrap in try/catch.
const indexMigrationSql = [
  { sql: 'ALTER TABLE user_ai_keys DROP INDEX uq_user_provider', ignoreErrors: [1091, 1176] }, // missing key
  { sql: 'ALTER TABLE user_ai_keys ADD UNIQUE KEY uq_user_provider_nick (user_id, provider, nickname)', ignoreErrors: [1061] },
];

// MySQL doesn't support CREATE INDEX IF NOT EXISTS — ignore duplicate key errors (1061)
const indexSql = [
  `CREATE INDEX idx_ai_usage_user_date    ON ai_usage(user_id, used_at)`,
  `CREATE INDEX idx_ai_usage_date          ON ai_usage(used_at)`,
  `CREATE INDEX idx_ai_jobs_user_status    ON ai_jobs(user_id, status)`,
  `CREATE INDEX idx_ai_jobs_created        ON ai_jobs(created_at)`,
  `CREATE INDEX idx_content_status         ON content_staging(status)`,
  `CREATE INDEX idx_content_user_status    ON content_staging(user_id, status)`,
  `CREATE INDEX idx_content_scheduled      ON content_staging(scheduled_at, status)`,
  `CREATE INDEX idx_logs_created           ON system_logs(created_at)`,
  `CREATE INDEX idx_logs_level             ON system_logs(level)`,
  `CREATE INDEX idx_users_wp_id            ON users(wp_user_id)`,
  `CREATE INDEX idx_ai_keys_user_provider  ON user_ai_keys(user_id, provider)`,
  `CREATE INDEX idx_rt_user                ON refresh_tokens(user_id)`,
  `CREATE INDEX idx_rt_hash                ON refresh_tokens(token_hash)`,
];

export async function runMigrations(dbPool: Pool = pool): Promise<void> {
  const conn = await dbPool.getConnection();
  try {
    for (const sql of tableSql) {
      await conn.execute(sql);
    }
    for (const sql of alterSql) {
      try {
        await conn.execute(sql);
      } catch (err: any) {
        // 1060 = ER_DUP_FIELDNAME (column already exists) — safe to ignore
        if (err.errno !== 1060) throw err;
      }
    }
    for (const step of indexMigrationSql) {
      try {
        await conn.execute(step.sql);
      } catch (err: any) {
        if (!step.ignoreErrors.includes(err.errno)) throw err;
      }
    }
    for (const sql of indexSql) {
      try {
        await conn.execute(sql);
      } catch (err: any) {
        // 1061 = ER_DUP_KEYNAME (index already exists) — safe to ignore
        if (err.errno !== 1061) throw err;
      }
    }
    console.log('✅ Database migration complete');
  } finally {
    conn.release();
  }
}

// Standalone script entry point
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(err => {
      console.error('❌ Migration failed:', err);
      pool.end().finally(() => process.exit(1));
    });
}
