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
        service: "canvas",
      },
    },
  })

  let lastSync: string | null = null
  if (token) {
    const log = await db.syncLog.findFirst({
      where: {
        userId: session.user.id,
        service: "canvas",
        status: "success",
      },
      orderBy: { completedAt: "desc" },
    })
    lastSync = log?.completedAt?.toISOString() ?? null
  }

  return NextResponse.json({ connected: !!token, lastSync })
}
