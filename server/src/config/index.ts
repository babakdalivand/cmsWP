import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Environment variable "${key}" is required but not set`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port:    parseInt(optional('PORT', '3001')),
  nodeEnv: optional('NODE_ENV', 'development'),

  db: {
    host:     optional('DB_HOST', 'localhost'),
    port:     parseInt(optional('DB_PORT', '3306')),
    name:     optional('DB_NAME', 'cms_miniapp'),
    user:     optional('DB_USER', 'root'),
    password: optional('DB_PASSWORD', ''),
  },

  jwt: {
    secret:            isProd ? required('JWT_SECRET') : optional('JWT_SECRET', 'dev_jwt_secret_not_for_prod'),
    expiresIn:         optional('JWT_EXPIRES_IN', '15m'),
    refreshExpiresMs:  parseInt(optional('JWT_REFRESH_EXPIRES_MS', String(30 * 24 * 60 * 60 * 1000))), // 30d
  },

  wp: {
    url:        process.env.WP_URL         || '',
    apiUser:    process.env.WP_API_USER    || '',
    apiPassword:process.env.WP_API_PASSWORD|| '',
    // Pre-derived key: sha256(AUTH_SALT + site_url)[:32], stored as hex
    cmmKeyHex:  process.env.WP_CMM_KEY_HEX || '',
    dbHost:     process.env.WP_DB_HOST     || 'localhost',
    dbName:     process.env.WP_DB_NAME     || 'wordpress',
    dbUser:     process.env.WP_DB_USER     || 'root',
    dbPassword: process.env.WP_DB_PASSWORD || '',
  },

  encryption: {
    key: isProd ? required('ENCRYPTION_KEY') : optional('ENCRYPTION_KEY', 'dev_encryption_key_32chars_xxxxx!'),
  },

  ai: {
    dailyQuota: parseInt(process.env.DAILY_AI_QUOTA || '10'),
    masterKeys: {
      openai:   process.env.ADMIN_OPENAI_KEY   || '',
      claude:   process.env.ADMIN_CLAUDE_KEY   || '',
      gemini:   process.env.ADMIN_GEMINI_KEY   || '',
      deepseek: process.env.ADMIN_DEEPSEEK_KEY || '',
      grok:     process.env.ADMIN_GROK_KEY     || '',
      mistral:  process.env.ADMIN_MISTRAL_KEY  || '',
    },
  },

  telegram: {
    botToken:    process.env.TELEGRAM_BOT_TOKEN     || '',
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
  },

  clientUrl:    process.env.CLIENT_URL    || 'http://localhost:5173',
  wpSyncToken:  process.env.WP_SYNC_TOKEN || '',
};
