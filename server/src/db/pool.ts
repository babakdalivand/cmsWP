import mysql from 'mysql2/promise';
import { config } from '../config';
import { logger } from '../monitoring/logger';

export const pool = mysql.createPool({
  host:              config.db.host,
  port:              config.db.port,
  database:          config.db.name,
  user:              config.db.user,
  password:          config.db.password,
  waitForConnections: true,
  connectionLimit:   20,
  queueLimit:        0,
  timezone:          '+00:00',
  supportBigNumbers: true,
  bigNumberStrings:  true,
  charset:           'utf8mb4',
});

pool.on('connection', () => {
  logger.debug('MySQL pool: new connection');
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params ?? []);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function queryInsert(sql: string, params?: any[]): Promise<number> {
  const [result] = await pool.execute(sql, params ?? []);
  return (result as mysql.ResultSetHeader).insertId;
}
