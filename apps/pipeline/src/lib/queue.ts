import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_NAME = 'jarvis-sync';

export const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
  console.error('[redis] Connection error:', err.message);
});

connection.on('connect', () => {
  console.log('[redis] Connected');
});

export interface SyncJobData {
  userId: string;
  services?: string[];
}

export const syncQueue = new Queue<SyncJobData>(QUEUE_NAME, { connection });

export function createSyncWorker(
  processor: (job: Job<SyncJobData>) => Promise<void>
): Worker<SyncJobData> {
  return new Worker<SyncJobData>(QUEUE_NAME, processor, {
    connection,
    concurrency: 12, // process 12 users simultaneously — safe for Neon pooled endpoint (10-20 connections)
  });
}
