import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createSyncWorker, syncQueue, connection } from './lib/queue';
import { syncUser } from './jobs/syncUser';
import { db } from './lib/db';

// ── BullMQ Worker ────────────────────────────────────────────
console.log('[worker] Starting Jarvis sync worker...');

const worker = createSyncWorker(async (job) => {
  const { userId, services } = job.data;
  console.log(`[worker] Processing sync job for user ${userId}${services ? ` (services: ${services.join(', ')})` : ' (full sync)'}`);
  await syncUser(userId, services);
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

  const { userId, services } = req.body;
  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ error: 'userId required' });
    return;
  }

  // Route through queue for deduplication and concurrency control
  await syncQueue.add('sync', { userId, services }, {
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

// ── Scheduled sync: every 30 minutes, all stale users ──────────
cron.schedule('*/30 * * * *', async () => {
  console.log('[Cron] Scheduled sync tick');
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const users = await db.user.findMany({
      where: {
        syncTokens: { some: { service: 'canvas' } },
        OR: [
          { lastSyncAt: null },
          { lastSyncAt: { lt: cutoff } },
        ],
      },
      select: { id: true, lastSyncAt: true },
      orderBy: [
        { lastSyncAt: 'asc' },  // stalest users get priority
        { id: 'asc' },           // stable tiebreaker
      ],
      take: 15,  // reduced from 50 — reasonable per 30-min tick
    });

    if (users.length === 0) {
      console.log('[Cron] No stale users to sync');
      return;
    }

    console.log(`[Cron] Enqueueing ${users.length} stale users`);

    // Stagger jobs with random 0-60s jitter to prevent thundering herd
    await Promise.all(
      users.map(u =>
        syncQueue.add('sync', { userId: u.id }, {
          jobId: `cron-sync-${u.id}-${Date.now()}`,
          delay: Math.floor(Math.random() * 60_000),
          removeOnComplete: true,
          removeOnFail: false,
        })
      )
    );
  } catch (err) {
    console.error('[Cron] Scheduled sync failed:', err);
  }
});

// ── Stale syncLog cleanup: every 15 minutes ─────────────────────
cron.schedule('*/15 * * * *', async () => {
  try {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const { count } = await db.syncLog.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: staleThreshold },
      },
      data: {
        status: 'failed',
        errorMessage: 'Sync timed out — process likely crashed',
        completedAt: new Date(),
      },
    });
    if (count > 0) {
      console.log(`[Cleanup] Marked ${count} stale syncLog entries as failed`);
    }
  } catch (err) {
    console.error('[Cleanup] SyncLog cleanup failed:', err);
  }
});

// ── Data retention: daily at 3 AM ───────────────────────────────
cron.schedule('0 3 * * *', async () => {
  console.log('[retention] Starting daily data retention...');
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    // 1. Prune SyncLog entries older than 90 days
    const syncLogResult = await db.syncLog.deleteMany({
      where: { startedAt: { lt: ninetyDaysAgo } },
    });

    // 2. Prune old RawGradescopeAssignment entries (>180 days)
    const rawGsAssignResult = await db.rawGradescopeAssignment.deleteMany({
      where: { syncedAt: { lt: oneEightyDaysAgo } },
    });

    // 3. Prune old non-current RawCanvasCourse entries (>180 days)
    const rawCanvasResult = await db.rawCanvasCourse.deleteMany({
      where: {
        syncedAt: { lt: oneEightyDaysAgo },
        isCurrent: false,
      },
    });

    // 4. Prune old RawGradescopeCourse entries (>180 days)
    const rawGsCourseResult = await db.rawGradescopeCourse.deleteMany({
      where: { syncedAt: { lt: oneEightyDaysAgo } },
    });

    console.log(`[retention] Pruned: ${syncLogResult.count} sync logs, ${rawGsAssignResult.count} raw GS assignments, ${rawCanvasResult.count} raw Canvas courses, ${rawGsCourseResult.count} raw GS courses`);
  } catch (err) {
    console.error('[retention] Data retention failed:', err);
  }
});

// ── Graceful Shutdown ────────────────────────────────────────
async function shutdown() {
  console.log('[worker] Shutting down...');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
