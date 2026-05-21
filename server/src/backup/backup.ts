import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createGzip } from 'zlib';
import { createReadStream, createWriteStream, unlink } from 'fs';
import { pipeline } from 'stream/promises';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import FormData from 'form-data';
import { createReadStream as fsCreateReadStream } from 'fs';
import { config } from '../config';
import { logger, dbLog } from '../monitoring/logger';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

async function createMysqlDump(): Promise<string> {
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpFile   = path.join(os.tmpdir(), `cms_backup_${timestamp}.sql`);
  const gzipFile   = `${dumpFile}.gz`;

  const cmd = [
    'mysqldump',
    `--host=${config.db.host}`,
    `--port=${config.db.port}`,
    `--user=${config.db.user}`,
    config.db.password ? `--password=${config.db.password}` : '',
    '--single-transaction',
    '--routines',
    '--triggers',
    '--add-drop-table',
    config.db.name,
    `> "${dumpFile}"`,
  ].filter(Boolean).join(' ');

  await execAsync(cmd);

  // Compress
  await pipeline(
    createReadStream(dumpFile),
    createGzip(),
    createWriteStream(gzipFile)
  );

  await unlinkAsync(dumpFile);
  return gzipFile;
}

async function sendToTelegram(filePath: string) {
  const { botToken, adminChatId } = config.telegram;
  if (!botToken || !adminChatId) {
    logger.warn('Telegram backup: BOT_TOKEN or ADMIN_CHAT_ID not configured, skipping send');
    return;
  }

  const fd = new FormData();
  fd.append('chat_id', adminChatId);
  fd.append('caption', `🗄️ پشتیبان دیتابیس CMS\n📅 ${new Date().toLocaleString('fa-IR')}`);
  fd.append('document', fsCreateReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'application/gzip',
  });

  await axios.post(
    `https://api.telegram.org/bot${botToken}/sendDocument`,
    fd,
    { headers: fd.getHeaders(), timeout: 60000 }
  );
}

async function runBackup() {
  logger.info('Starting database backup...');
  let gzipFile: string | null = null;

  try {
    gzipFile = await createMysqlDump();
    await sendToTelegram(gzipFile);
    await dbLog('info', 'backup', 'Database backup completed successfully', {
      file: path.basename(gzipFile),
    });
    logger.info('Database backup sent to Telegram');
  } catch (err: any) {
    await dbLog('error', 'backup', 'Database backup failed', { error: err.message });
    logger.error('Database backup failed', { error: err.message });
  } finally {
    if (gzipFile) {
      try { await unlinkAsync(gzipFile); } catch { /* ignore */ }
    }
  }
}

export function startBackupScheduler() {
  // Run every 24 hours at 03:00
  cron.schedule('0 3 * * *', async () => {
    await runBackup();
  });

  logger.info('Backup scheduler started — daily at 03:00');
}

// Allow manual trigger via API
export { runBackup };
