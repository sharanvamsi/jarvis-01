import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { encrypt } from "@/lib/encrypt"

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await db.syncToken.deleteMany({
    where: { userId: session.user.id, service: "ed" },
  })

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token } = await req.json()
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  // Canvas must be connected before Ed
  const canvasToken = await db.syncToken.findFirst({
    where: { userId: session.user.id, service: 'canvas' },
    select: { id: true },
  })
  if (!canvasToken) {
    return NextResponse.json(
      { error: 'Canvas must be connected before adding Ed integration' },
      { status: 400 }
    )
  }

  const encrypted = encrypt(token.trim())

  await db.syncToken.upsert({
    where: {
      userId_service: {
        userId: session.user.id,
        service: "ed",
      },
    },
    update: { accessToken: encrypted },
    create: {
      userId: session.user.id,
      service: "ed",
      accessToken: encrypted,
    },
  })

  // Fire-and-forget sync trigger so Ed data appears immediately
  const pipelineUrl = process.env.PIPELINE_INTERNAL_URL
  if (pipelineUrl) {
    fetch(`${pipelineUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
      },
      body: JSON.stringify({ userId: session.user.id }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
