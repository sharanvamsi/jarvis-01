'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Settings } from 'lucide-react'
import Link from 'next/link'

type Assignment = {
  id: string
  name: string
  courseCode: string
  dueDate: Date | null
  daysUntil: number | null
  overdue: boolean
  status: string
  submitted: boolean
  score: number | null
  pointsPossible: number | null
  source: string
  htmlUrl: string | null
}

type CalendarEvent = {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string | null
  isAllDay: boolean
}

type CalendarClientProps = {
  assignments: Assignment[]
  userId: string
  calendarConnected: boolean
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCourseColor(code: string): string {
  const map: Record<string, string> = {
    'CS 162': '#3B82F6',
    'CS 189': '#8B5CF6',
    'UGBA 102A': '#F59E0B',
    'UGBA 103': '#10B981',
  }
  return map[code] || '#6B7280'
}

function getMonday(weekOffset: number): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7
  return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
}

function getWeekDates(weekOffset: number): Date[] {
  const monday = getMonday(weekOffset)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDate(d: Date): string {
  return `${DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1]} ${d.getMonth() + 1}/${d.getDate()}`
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function CalendarClient({ assignments, userId, calendarConnected }: CalendarClientProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const now = new Date()

  // Fetch calendar events for the current week
  useEffect(() => {
    fetch(`/api/calendar/events?weekOffset=${weekOffset}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: CalendarEvent[]) => setEvents(data))
      .catch(() => setEvents([]))
  }, [weekOffset])

  const parsedAssignments = useMemo(
    () =>
      assignments.map((a) => ({
        ...a,
        dueDate: a.dueDate ? new Date(a.dueDate) : null,
      })),
    [assignments]
  )

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])
  const weekStart = weekDates[0]
  const weekEnd = new Date(weekDates[6])
  weekEnd.setHours(23, 59, 59, 999)

  const weekAssignments = useMemo(
    () =>
      parsedAssignments.filter(
        (a) => a.dueDate && a.dueDate >= weekStart && a.dueDate <= weekEnd
      ),
    [parsedAssignments, weekStart, weekEnd]
  )

  function assignmentsForDay(date: Date) {
    return weekAssignments.filter(
      (a) => a.dueDate && isSameDay(a.dueDate, date)
    )
  }

  function eventsForDay(date: Date) {
    return events.filter((e) => isSameDay(new Date(e.startTime), date))
  }

  const weekLabel = `${weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1440px] mx-auto p-4 md:p-8">
        <h1 className="text-[28px] font-medium text-[#F5F5F5] mb-6">Calendar</h1>

        {/* Connect Google Calendar banner — only if not connected */}
        {!calendarConnected && (
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#A3A3A3]" />
              <span className="text-[#A3A3A3] text-sm">
                Connect Google Calendar to see your schedule
              </span>
            </div>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 text-[#3B82F6] text-sm hover:underline"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>
          </div>
        )}

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-1.5 rounded hover:bg-[#161616] text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-1.5 rounded hover:bg-[#161616] text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-1 rounded text-xs font-medium text-[#3B82F6] hover:bg-[#161616] transition-colors"
              >
                Today
              </button>
            )}
          </div>
          <span className="text-[#A3A3A3] text-sm">{weekLabel}</span>
        </div>

        {/* Desktop: Week grid */}
        <div className="hidden md:grid grid-cols-7 gap-2 mb-8">
          {weekDates.map((date, i) => {
            const isToday = isSameDay(date, now)
            const dayAssignments = assignmentsForDay(date)
            const dayEvents = eventsForDay(date)

            return (
              <div key={i} className="min-h-[200px]">
                <div
                  className={`text-center mb-2 pb-2 border-b border-[#1F1F1F] ${
                    isToday ? 'text-[#3B82F6]' : 'text-[#A3A3A3]'
                  }`}
                >
                  <div className="text-xs font-medium">{DAY_NAMES[i]}</div>
                  <div
                    className={`text-lg font-medium ${
                      isToday ? 'text-[#3B82F6]' : 'text-[#F5F5F5]'
                    }`}
                  >
                    {date.getDate()}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {/* Calendar events */}
                  {dayEvents.map((e) => {
                    const start = new Date(e.startTime)
                    const end = new Date(e.endTime)
                    return (
                      <div
                        key={e.id}
                        className="bg-[#111111] border border-[#1F1F1F] rounded p-2 hover:bg-[#161616] transition-colors"
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          <span className="text-[#F5F5F5] text-xs truncate">{e.title}</span>
                        </div>
                        <div className="text-[#525252] text-[10px]">
                          {e.isAllDay ? 'All day' : `${formatTime(start)} - ${formatTime(end)}`}
                        </div>
                        {e.location && (
                          <div className="text-[#525252] text-[10px] truncate">{e.location}</div>
                        )}
                      </div>
                    )
                  })}
                  {/* Assignments */}
                  {dayAssignments.map((a) => {
                    const color = getCourseColor(a.courseCode)
                    return (
                      <div
                        key={a.id}
                        className="bg-[#111111] border border-[#1F1F1F] rounded p-2 hover:bg-[#161616] transition-colors"
                      >
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mb-1"
                          style={{
                            backgroundColor: `${color}20`,
                            color: color,
                          }}
                        >
                          {a.courseCode}
                        </span>
                        <div className="text-[#F5F5F5] text-xs truncate">
                          {a.name}
                        </div>
                        {a.dueDate && (
                          <div className="text-[#525252] text-[10px] mt-0.5">
                            Due {formatTime(a.dueDate)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Mobile: List view */}
        <div className="md:hidden space-y-3 mb-8">
          {weekDates.map((date, i) => {
            const isToday = isSameDay(date, now)
            const dayAssignments = assignmentsForDay(date)
            const dayEvents = eventsForDay(date)
            if (dayAssignments.length === 0 && dayEvents.length === 0 && !isToday) return null

            return (
              <div key={i}>
                <div
                  className={`text-sm font-medium mb-2 ${
                    isToday ? 'text-[#3B82F6]' : 'text-[#A3A3A3]'
                  }`}
                >
                  {formatDate(date)}
                  {isToday && (
                    <span className="ml-2 text-xs text-[#3B82F6]">Today</span>
                  )}
                </div>
                {dayEvents.length > 0 || dayAssignments.length > 0 ? (
                  <div className="space-y-2">
                    {dayEvents.map((e) => {
                      const start = new Date(e.startTime)
                      const end = new Date(e.endTime)
                      return (
                        <div
                          key={e.id}
                          className="bg-[#111111] border border-[#1F1F1F] rounded p-3 hover:bg-[#161616] transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="text-[#F5F5F5] text-sm">{e.title}</span>
                          </div>
                          <div className="text-[#525252] text-xs ml-4">
                            {e.isAllDay ? 'All day' : `${formatTime(start)} - ${formatTime(end)}`}
                          </div>
                          {e.location && (
                            <div className="text-[#525252] text-xs ml-4">{e.location}</div>
                          )}
                        </div>
                      )
                    })}
                    {dayAssignments.map((a) => {
                      const color = getCourseColor(a.courseCode)
                      return (
                        <div
                          key={a.id}
                          className="bg-[#111111] border border-[#1F1F1F] rounded p-3 hover:bg-[#161616] transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: `${color}20`,
                                color: color,
                              }}
                            >
                              {a.courseCode}
                            </span>
                            {a.dueDate && (
                              <span className="text-[#525252] text-xs">
                                Due {formatTime(a.dueDate)}
                              </span>
                            )}
                          </div>
                          <div className="text-[#F5F5F5] text-sm">
                            {a.name}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bg-[#111111] border border-[#1F1F1F] rounded p-3">
                    <p className="text-[#525252] text-xs">No events</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* This Week section */}
        <div>
          <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">
            {weekOffset === 0 ? 'Due This Week' : `Due ${weekLabel}`}
          </h2>
          {weekAssignments.length > 0 ? (
            <div className="space-y-2">
              {weekAssignments.map((a) => {
                const color = getCourseColor(a.courseCode)
                const isOverdue = a.overdue && !a.submitted
                return (
                  <div
                    key={a.id}
                    className={`bg-[#111111] border border-[#1F1F1F] rounded p-4 hover:bg-[#161616] transition-colors ${
                      isOverdue ? 'border-l-2 border-l-[#EF4444]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `${color}20`,
                              color: color,
                            }}
                          >
                            {a.courseCode}
                          </span>
                          {a.submitted && (
                            <span className="px-2 py-0.5 rounded text-xs bg-[#10B98120] text-[#10B981]">
                              Submitted
                            </span>
                          )}
                        </div>
                        <div className="text-[#F5F5F5] text-sm mb-1">
                          {a.name}
                        </div>
                        <div
                          className={`text-xs ${
                            isOverdue
                              ? 'text-[#EF4444]'
                              : a.daysUntil !== null && a.daysUntil <= 2
                                ? 'text-[#F59E0B]'
                                : 'text-[#A3A3A3]'
                          }`}
                        >
                          {a.dueDate
                            ? `${a.dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTime(a.dueDate)}`
                            : 'No due date'}
                        </div>
                      </div>
                      {a.score !== null && a.pointsPossible !== null && (
                        <div className="text-[#F5F5F5] text-sm font-medium">
                          {a.score}/{a.pointsPossible}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-6 text-center">
              <p className="text-[#A3A3A3] text-sm">
                No assignments due this week
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
