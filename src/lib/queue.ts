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

export const syncQueue = new Queue(QUEUE_NAME, { connection });

export function createSyncWorker(
  processor: (job: Job) => Promise<void>
): Worker {
  return new Worker(QUEUE_NAME, processor, {
    connection,
    concurrency: 3, // process 3 users simultaneously — safe for Neon connection pool
  });
}
