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

  return NextResponse.json({ success: true })
}
