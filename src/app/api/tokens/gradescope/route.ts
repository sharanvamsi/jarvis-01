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
    where: { userId: session.user.id, service: "gradescope" },
  })

  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email, password } = await req.json()
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    )
  }

  const credentials = JSON.stringify({
    email: email.trim(),
    password: password.trim(),
  })
  const encrypted = encrypt(credentials)

  await db.syncToken.upsert({
    where: {
      userId_service: {
        userId: session.user.id,
        service: "gradescope",
      },
    },
    update: { accessToken: encrypted },
    create: {
      userId: session.user.id,
      service: "gradescope",
      accessToken: encrypted,
    },
  })

  return NextResponse.json({ success: true })
}
