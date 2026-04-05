import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const account = await db.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    })

    if (account?.access_token) {
      // Revoke the token with Google so next sign-in shows full consent
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${account.access_token}`,
        { method: "POST" }
      ).catch(() => {
        // Ignore — token may already be expired
      })
    }

    // Delete the account record so NextAuth creates a fresh one on next sign-in
    if (account) {
      await db.account.delete({ where: { id: account.id } })
    }

    // Clean up calendar data
    await db.calendarEvent.deleteMany({
      where: { userId: session.user.id },
    })

    await db.syncLog.deleteMany({
      where: { userId: session.user.id, service: "calendar" },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[revoke]", error)
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 })
  }
}
