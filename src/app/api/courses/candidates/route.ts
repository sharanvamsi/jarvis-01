import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { normalizeCourseCode, isNonAcademicCourse } from '@/lib/canvas-utils'

/**
 * GET /api/courses/candidates
 *
 * Returns the user's active Canvas courses from RawCanvasCourse,
 * annotated with their current enrollment/selection status.
 * No Canvas API call needed — reads from pipeline-populated data.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Read raw courses populated by the pipeline canvas worker
  const rawCourses = await db.rawCanvasCourse.findMany({
    where: { userId, isCurrent: true },
    orderBy: { name: 'asc' },
  })

  // Get existing enrollments with selection status
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: { course: { select: { canvasId: true } } },
  })

  const enrollmentMap = new Map(
    enrollments.map((e) => [e.course.canvasId, e.userSelected])
  )

  // Only show courses from the current semester (SP26) — past courses
  // can't be synced because Canvas won't serve data for concluded courses
  const CURRENT_TERMS = ['SP26']

  const courses = rawCourses
    .filter((c) => {
      if (!c.name) return false
      if (isNonAcademicCourse(c.name, c.courseCode ?? '')) return false
      // Must be a current semester course
      const term = c.term ?? 'UNKNOWN'
      if (!CURRENT_TERMS.includes(term)) return false
      return true
    })
    .map((c) => ({
      canvasId: c.canvasCourseId,
      courseCode: normalizeCourseCode(c.courseCode ?? c.name ?? ''),
      courseName: c.name ?? '',
      term: c.term ?? 'UNKNOWN',
      selected: enrollmentMap.get(c.canvasCourseId) ?? null,
    }))

  return NextResponse.json({ courses })
}
