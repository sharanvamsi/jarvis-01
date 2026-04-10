import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ connected: false, lastSync: null })
  }

  const userId = session.user.id

  const token = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: "canvas" } },
  })

  if (!token) {
    return NextResponse.json({ connected: false, lastSync: null })
  }

  const [successLog, latestLog] = await Promise.all([
    db.syncLog.findFirst({
      where: { userId, service: "canvas", status: { in: ["success", "partial"] } },
      orderBy: { completedAt: "desc" },
    }),
    db.syncLog.findFirst({
      where: { userId, service: "canvas" },
      orderBy: { startedAt: "desc" },
    }),
  ])

  const expiresInDays = token.userExpiresAt
    ? Math.ceil((token.userExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return NextResponse.json({
    connected: true,
    lastSync: successLog?.completedAt?.toISOString() ?? null,
    userExpiresAt: token.userExpiresAt?.toISOString() ?? null,
    expiresInDays,
    syncStatus: latestLog?.status ?? null,
    syncError: latestLog?.status === 'failed' ? (latestLog.errorMessage ?? null) : null,
    recordsFetched: successLog?.recordsFetched ?? 0,
  })
}
