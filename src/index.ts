import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createSyncWorker, syncQueue, connection } from './lib/queue';
import { syncUser } from './jobs/syncUser';
import { db } from './lib/db';

// ── BullMQ Worker ────────────────────────────────────────────
console.log('[worker] Starting Jarvis sync worker...');

const worker = createSyncWorker(async (job) => {
  const { userId } = job.data;
  console.log(`[worker] Processing sync job for user ${userId}`);
  await syncUser(userId);
});

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed for user ${job.data.userId}`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[worker] Worker error:', err);
});

// ── HTTP Server ──────────────────────────────────────────────
const app = express();
app.use(cors({
  origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-pipeline-secret'],
}));
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    await connection.ping();
    res.json({ ok: true, ts: new Date().toISOString(), services: { db: 'ok', redis: 'ok' } });
  } catch (error) {
    console.error('[health] check failed:', error);
    res.status(503).json({ ok: false, ts: new Date().toISOString(), error: 'Service unhealthy' });
  }
});

app.post('/sync', async (req, res) => {
  const secret = req.headers['x-pipeline-secret'];
  if (!secret || secret !== process.env.PIPELINE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { userId } = req.body;
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ error: 'userId required' });
    return;
  }

  // Route through queue for deduplication and concurrency control
  await syncQueue.add('sync', { userId }, {
    jobId: `sync-${userId}-${Date.now()}`,
    removeOnComplete: true,
    removeOnFail: false,
  });
  res.json({ ok: true, message: 'Sync queued' });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`[pipeline] HTTP server listening on port ${PORT}`);
});

// ── Graceful Shutdown ────────────────────────────────────────
async function shutdown() {
  console.log('[worker] Shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
