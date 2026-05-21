'use strict';
import { randomUUID } from 'crypto';
import { query } from '../db/pool';
import { runAI, AIProvider } from './aiRouter';
import { logger, dbLog } from '../monitoring/logger';

export type JobStatus  = 'pending' | 'processing' | 'completed' | 'failed';
export type QueueName  = 'ai-generation' | 'ai-rewrite' | 'ai-summary';

export interface JobPayload {
  userId:   number;
  provider: AIProvider;
  action:   string;
  prompt:   string;
  queue:    QueueName;
}

interface MemJob { status: JobStatus; result?: string; error?: string }

// In-memory store for active jobs (fast polling without DB hit)
const activeJobs = new Map<string, MemJob>();
const MAX_RETRIES = 3;
const JOB_TTL_MS  = 10 * 60 * 1000; // evict from memory after 10 min

export async function enqueueJob(payload: JobPayload): Promise<string> {
  const jobId = randomUUID();

  await query(
    `INSERT INTO ai_jobs (id, user_id, queue, status, input) VALUES (?, ?, ?, 'pending', ?)`,
    [jobId, payload.userId, payload.queue, JSON.stringify(payload)]
  );

  activeJobs.set(jobId, { status: 'pending' });

  // Fire-and-forget — Node event loop handles this asynchronously
  setImmediate(() => processJob(jobId, payload, 0));

  return jobId;
}

async function processJob(jobId: string, payload: JobPayload, attempt: number): Promise<void> {
  activeJobs.set(jobId, { status: 'processing' });
  await query(
    `UPDATE ai_jobs SET status='processing', attempts=? WHERE id=?`,
    [attempt + 1, jobId]
  );

  try {
    const { result } = await runAI(payload.userId, payload.provider, payload.prompt, payload.action);

    activeJobs.set(jobId, { status: 'completed', result });
    await query(`UPDATE ai_jobs SET status='completed', result=? WHERE id=?`, [result, jobId]);
    await dbLog('info', 'ai-queue', `Job ${jobId} completed`, { userId: payload.userId, attempt: attempt + 1 });

    setTimeout(() => activeJobs.delete(jobId), JOB_TTL_MS);
  } catch (err: any) {
    const isLastAttempt = attempt >= MAX_RETRIES - 1;

    if (!isLastAttempt) {
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      activeJobs.set(jobId, { status: 'pending' });
      await query(`UPDATE ai_jobs SET status='pending', attempts=? WHERE id=?`, [attempt + 1, jobId]);
      logger.warn(`Job ${jobId} attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: err.message });
      setTimeout(() => processJob(jobId, payload, attempt + 1), delay);
    } else {
      activeJobs.set(jobId, { status: 'failed', error: err.message });
      await query(`UPDATE ai_jobs SET status='failed', error=? WHERE id=?`, [err.message, jobId]);
      await dbLog('error', 'ai-queue', `Job ${jobId} failed after ${MAX_RETRIES} attempts`, {
        error: err.message, userId: payload.userId,
      });
      setTimeout(() => activeJobs.delete(jobId), JOB_TTL_MS);
    }
  }
}

export async function getJobStatus(
  jobId: string,
  userId: number
): Promise<{ id: string; status: JobStatus; result?: string; error?: string; queue: string } | null> {
  // Always verify ownership in DB (security)
  const rows = await query<{ user_id: number; queue: string; status: string; result: string | null; error: string | null }>(
    `SELECT user_id, queue, status, result, error FROM ai_jobs WHERE id=?`,
    [jobId]
  );
  const row = rows[0];
  if (!row || row.user_id !== userId) return null;

  // Prefer in-memory status (more up-to-date for active jobs)
  const mem = activeJobs.get(jobId);
  return {
    id:     jobId,
    status: (mem?.status ?? row.status) as JobStatus,
    result: mem?.result ?? row.result ?? undefined,
    error:  mem?.error  ?? row.error  ?? undefined,
    queue:  row.queue,
  };
}

export function queueNameForAction(action: string): QueueName {
  if (action === 'improve' || action === 'rewrite') return 'ai-rewrite';
  if (action === 'summary')                          return 'ai-summary';
  return 'ai-generation';
}
