export const revalidate = 300;

import { requireAuth, getUpcomingAssignments, getWeekCalendarEvents, hasCalendarEvents } from '@/lib/data'
import { CalendarClient } from '@/components/calendar/CalendarClient'

export default async function CalendarPage() {
  const user = await requireAuth()
  const [assignments, calendarConnected, initialEvents] = await Promise.all([
    getUpcomingAssignments(user.id),
    hasCalendarEvents(user.id),
    getWeekCalendarEvents(user.id, 0),
  ])
  return (
    <CalendarClient
      assignments={assignments}
      userId={user.id}
      calendarConnected={calendarConnected}
      initialEvents={initialEvents.map((e) => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        location: e.location,
        isAllDay: e.isAllDay,
      }))}
    />
  )
}
