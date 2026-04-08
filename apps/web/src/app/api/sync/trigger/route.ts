import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { triggerPipelineSync } from '@/lib/sync'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Rate limit: block if any sync started in the last 2 minutes (running or completed)
  const recentSync = await db.syncLog.findFirst({
    where: {
      userId,
      startedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    orderBy: { startedAt: 'desc' },
  })

  if (recentSync) {
    return NextResponse.json(
      {
        ok: false,
        alreadySyncing: true,
        message: recentSync.status === 'running'
          ? 'A sync is already running — your new data will be included'
          : 'Please wait before syncing again',
      },
      { status: 429 }
    )
  }

  await triggerPipelineSync(userId)

  return NextResponse.json({ ok: true, message: 'Sync started' })
}
