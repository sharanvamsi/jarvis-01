import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

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
    const status = recentSync.status === 'running' ? 'Sync already in progress' : 'Please wait before syncing again'
    return NextResponse.json({ ok: false, message: status }, { status: 429 })
  }

  // Try to trigger pipeline
  const pipelineUrl = process.env.PIPELINE_INTERNAL_URL
  if (pipelineUrl) {
    try {
      const res = await fetch(`${pipelineUrl}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': process.env.PIPELINE_SECRET!,
        },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        return NextResponse.json({ ok: true, message: 'Sync started' })
      }
    } catch {
      // Pipeline unreachable — fall through
    }
  }

  // Fallback: let the scheduled sync pick it up
  return NextResponse.json({ ok: true, message: 'Sync scheduled' })
}
