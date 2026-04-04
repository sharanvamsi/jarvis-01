import { requireAuth, getUpcomingAssignments, getWeekCalendarEvents, hasCalendarEvents } from '@/lib/data'
import { CalendarClient } from '@/components/calendar/CalendarClient'

export default async function CalendarPage() {
  const user = await requireAuth()
  const [assignments, calendarConnected] = await Promise.all([
    getUpcomingAssignments(user.id),
    hasCalendarEvents(user.id),
  ])
  return (
    <CalendarClient
      assignments={assignments}
      userId={user.id}
      calendarConnected={calendarConnected}
    />
  )
}
