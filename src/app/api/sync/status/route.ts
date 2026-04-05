import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const logs = await db.syncLog.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  })

  // Most recent per service
  const byService: Record<string, {
    status: string
    lastSync: Date | null
    error: string | null
    recordsFetched: number
  }> = {}

  for (const log of logs) {
    if (!byService[log.service]) {
      byService[log.service] = {
        status: log.status,
        lastSync: log.completedAt ?? log.startedAt,
        error: log.errorMessage ?? null,
        recordsFetched: log.recordsFetched ?? 0,
      }
    }
  }

  const isRunning = Object.values(byService).some(s => s.status === 'running')

  return NextResponse.json({ isRunning, services: byService })
}
