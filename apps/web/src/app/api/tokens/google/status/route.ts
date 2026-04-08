import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ connected: false, hasCalendarScope: false, lastSync: null, eventCount: 0 })
  }

  const userId = session.user.id

  const account = await db.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  })

  if (!account) {
    return NextResponse.json({ connected: false, hasCalendarScope: false, lastSync: null, eventCount: 0 })
  }

  const hasCalendarScope = (account.scope ?? "").includes("calendar")

  const [lastSyncLog, eventCount] = await Promise.all([
    db.syncLog.findFirst({
      where: { userId, service: "calendar", status: "success" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.calendarEvent.count({ where: { userId } }),
  ])

  return NextResponse.json({
    connected: true,
    hasCalendarScope,
    lastSync: lastSyncLog?.completedAt?.toISOString() ?? null,
    eventCount,
  })
}
