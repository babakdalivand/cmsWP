import { randomUUID } from 'crypto';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger, requestContext, dbLog } from './monitoring/logger';
import routes from './routes';
import { startScheduler } from './scheduler/scheduler';
import { startBackupScheduler, runBackup } from './backup/backup';
import { authMiddleware, requireAdmin } from './middleware/auth';
import { pool } from './db/pool';

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [config.clientUrl, 'https://web.telegram.org', /\.telegram\.org$/],
  credentials: true,
  exposedHeaders: ['X-Request-ID'],
}));
app.use(compression());

// ── Correlation ID — first middleware, runs before everything else ─────────────
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  requestContext.run({ requestId }, next);
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'تعداد تلاش بیش از حد مجاز' } }));
app.use('/api/ai/generate', rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'بیش از حد درخواست AI ارسال کردید' } }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.path} ${res.statusCode} ${ms}ms`, {
      ip: req.ip,
      ua: req.headers['user-agent']?.slice(0, 60),
    });
  });
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Admin backup trigger ──────────────────────────────────────────────────────
app.post('/api/admin/backup', authMiddleware, requireAdmin, async (_req, res) => {
  res.json({ message: 'پشتیبان‌گیری آغاز شد' });
  runBackup().catch(err => logger.error('Manual backup failed', { error: err.message }));
});

// ── Health check (detailed) ───────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    dbOk = true;
  } catch { /* db down */ }

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    ts:      new Date().toISOString(),
    uptime:  Math.floor(process.uptime()),
    env:     config.nodeEnv,
    db:      dbOk ? 'ok' : 'error',
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── Serve React static files (production only) ────────────────────────────────
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuild));
app.get('*', (_req, res) => {
  const indexFile = path.join(clientBuild, 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) res.status(404).json({ error: 'Not found' });
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  dbLog('error', 'server', `Unhandled: ${err.message}`, { path: req.path }).catch(() => {});
  res.status(500).json({ error: 'خطای داخلی سرور' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port} [${config.nodeEnv}]`);
  startScheduler();
  startBackupScheduler();
});

export default app;
