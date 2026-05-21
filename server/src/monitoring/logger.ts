import { AsyncLocalStorage } from 'async_hooks';
import winston from 'winston';
import { query } from '../db/pool';

// Correlation ID store — one requestId per async call chain
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const requestId = getRequestId();
    const base = { timestamp, level, message, ...(requestId ? { requestId } : {}), ...meta };
    return JSON.stringify(base);
  })
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const requestId = getRequestId();
    const rid = requestId ? ` [${requestId.slice(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp}${rid} [${level}]: ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? jsonFormat : devFormat,
    }),
  ],
});

export async function dbLog(level: string, source: string, message: string, meta?: object) {
  const requestId = getRequestId();
  try {
    await query(
      'INSERT INTO system_logs (level, source, message, meta) VALUES (?, ?, ?, ?)',
      [level, source, message, JSON.stringify({ ...(requestId ? { requestId } : {}), ...meta })]
    );
  } catch {
    // non-fatal: DB log failure must never crash the request
  }
}
