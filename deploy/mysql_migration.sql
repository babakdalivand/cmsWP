-- ============================================================
--  CMS MiniApp Wp — MySQL Migration Script (v2 — Production)
--  Compatible with MySQL 8.0+ (Hostinger)
--  Run: mysql -u USER -p DATABASE < mysql_migration.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  wp_user_id    INT NOT NULL,
  username      VARCHAR(100) NOT NULL,
  display_name  VARCHAR(200),
  email         VARCHAR(200),
  role          VARCHAR(50)  NOT NULL DEFAULT 'editor',
  avatar_url    TEXT,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wp_user_id (wp_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── AI Keys (encrypted with AES-256) ─────────────────────
CREATE TABLE IF NOT EXISTS user_ai_keys (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT  NOT NULL,
  provider     VARCHAR(50) NOT NULL,
  api_key_enc  TEXT NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  CONSTRAINT fk_aikeys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── AI Usage & Quota ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT         NOT NULL,
  provider     VARCHAR(50) NOT NULL,
  model        VARCHAR(100),
  action       VARCHAR(100),
  tokens_in    INT         NOT NULL DEFAULT 0,
  tokens_out   INT         NOT NULL DEFAULT 0,
  used_own_key TINYINT(1)  NOT NULL DEFAULT 0,
  used_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aiusage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── AI Async Jobs (job queue persistence) ────────────────
CREATE TABLE IF NOT EXISTS ai_jobs (
  id         VARCHAR(36)  PRIMARY KEY,
  user_id    INT          NOT NULL,
  queue      VARCHAR(50)  NOT NULL COMMENT 'ai-generation|ai-rewrite|ai-summary',
  status     ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  input      JSON         NOT NULL,
  result     LONGTEXT,
  error      TEXT,
  attempts   INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aijobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Content Staging ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_staging (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT,
  wp_post_id     INT,
  content_type   VARCHAR(50)  NOT NULL DEFAULT 'article',
  lang           VARCHAR(20)  NOT NULL DEFAULT 'fa',
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
  status         VARCHAR(30)  NOT NULL DEFAULT 'draft'
                 COMMENT 'draft|pending|published|rejected|scheduled',
  approval_note  TEXT,
  approved_by    INT,
  approved_at    DATETIME,
  scheduled_at   DATETIME,
  published_at   DATETIME,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_content_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_content_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Refresh Tokens (rotation-based security) ─────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE COMMENT 'SHA-256 of the raw token',
  device_info VARCHAR(200)          COMMENT 'User-Agent header',
  ip          VARCHAR(45),
  expires_at  DATETIME     NOT NULL,
  revoked     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── System Logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  level      VARCHAR(20)  NOT NULL,
  source     VARCHAR(50),
  message    TEXT         NOT NULL,
  meta       JSON,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date    ON ai_usage(user_id, used_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_date          ON ai_usage(used_at);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_user_status    ON ai_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_created        ON ai_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_content_status         ON content_staging(status);
CREATE INDEX IF NOT EXISTS idx_content_user_status    ON content_staging(user_id, status);
CREATE INDEX IF NOT EXISTS idx_content_scheduled      ON content_staging(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_logs_created           ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_level             ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_users_wp_id            ON users(wp_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_keys_user_provider  ON user_ai_keys(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_rt_user                ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_hash                ON refresh_tokens(token_hash);

SET FOREIGN_KEY_CHECKS = 1;

-- ─── Verify ───────────────────────────────────────────────
SELECT 'users'           AS tbl, COUNT(*) AS rows FROM users
UNION ALL SELECT 'user_ai_keys',   COUNT(*) FROM user_ai_keys
UNION ALL SELECT 'ai_usage',       COUNT(*) FROM ai_usage
UNION ALL SELECT 'ai_jobs',        COUNT(*) FROM ai_jobs
UNION ALL SELECT 'content_staging',COUNT(*) FROM content_staging
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'system_logs',    COUNT(*) FROM system_logs;
