import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getWeekCalendarEvents } from "@/lib/data"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 })
  }

  const weekOffset = parseInt(req.nextUrl.searchParams.get("weekOffset") ?? "0", 10)
  const events = await getWeekCalendarEvents(session.user.id, isNaN(weekOffset) ? 0 : weekOffset)

  return NextResponse.json(
    events.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      location: e.location,
      isAllDay: e.isAllDay,
    }))
  )
}
