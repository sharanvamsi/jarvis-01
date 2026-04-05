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
    where: { userId: session.user.id, service: "canvas" },
  })

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { token, userExpiresAt } = await req.json()
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token required" }, { status: 400 })
  }

  const encrypted = encrypt(token.trim())
  const expiryDate = userExpiresAt ? new Date(userExpiresAt) : null

  await db.syncToken.upsert({
    where: {
      userId_service: {
        userId: session.user.id,
        service: "canvas",
      },
    },
    update: { accessToken: encrypted, userExpiresAt: expiryDate },
    create: {
      userId: session.user.id,
      service: "canvas",
      accessToken: encrypted,
      userExpiresAt: expiryDate,
    },
  })

  return NextResponse.json({ success: true })
}
