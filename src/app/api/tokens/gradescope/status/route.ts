import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ connected: false, lastSync: null })
  }

  const token = await db.syncToken.findUnique({
    where: {
      userId_service: {
        userId: session.user.id,
        service: "gradescope",
      },
    },
  })

  let lastSync: string | null = null
  let syncError: string | null = null
  if (token) {
    const [successLog, latestLog] = await Promise.all([
      db.syncLog.findFirst({
        where: {
          userId: session.user.id,
          service: "gradescope",
          status: "success",
        },
        orderBy: { completedAt: "desc" },
      }),
      db.syncLog.findFirst({
        where: {
          userId: session.user.id,
          service: "gradescope",
        },
        orderBy: { startedAt: "desc" },
      }),
    ])
    lastSync = successLog?.completedAt?.toISOString() ?? null
    if (latestLog?.status === 'failed') {
      syncError = latestLog.errorMessage ?? 'Last sync failed'
    }
  }

  return NextResponse.json({ connected: !!token, lastSync, syncError })
}
