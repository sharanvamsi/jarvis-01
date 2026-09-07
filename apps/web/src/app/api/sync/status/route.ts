import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [logs, user, handoff, canvasToken] = await Promise.all([
    db.syncLog.findMany({
      where: { userId: session.user.id, service: { not: 'semester_handoff' } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { currentSemester: true },
    }),
    db.syncLog.findFirst({
      where: {
        userId: session.user.id,
        service: 'semester_handoff',
        startedAt: { gte: sevenDaysAgo },
      },
      orderBy: { startedAt: 'desc' },
      select: { errorMessage: true, startedAt: true },
    }),
    db.syncToken.findUnique({
      where: { userId_service: { userId: session.user.id, service: 'canvas' } },
      select: { id: true },
    }),
  ])

  const selectedCurrentCourses = user
    ? await db.enrollment.count({
        where: {
          userId: session.user.id,
          userSelected: true,
          course: { term: user.currentSemester },
        },
      })
    : 0

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

  return NextResponse.json({
    isRunning,
    services: byService,
    currentSemester: user?.currentSemester ?? null,
    semesterHandoff:
      handoff && canvasToken && selectedCurrentCourses === 0
        ? { message: handoff.errorMessage, detectedAt: handoff.startedAt }
        : null,
  })
}
