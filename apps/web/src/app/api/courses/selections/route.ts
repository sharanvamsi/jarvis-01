import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { normalizeCourseCode, extractSemester } from '@/lib/canvas-utils'
import { getCurrentTerms } from '@/lib/semester'

/**
 * POST /api/courses/selections
 *
 * Save the user's course selections from the settings page.
 * Creates Course + Enrollment records for courses that don't exist yet
 * (e.g. past-semester courses from RawCanvasCourse).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { selectedCanvasIds } = (await req.json()) as {
    selectedCanvasIds: string[]
  }

  if (!Array.isArray(selectedCanvasIds) || selectedCanvasIds.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one course' },
      { status: 400 }
    )
  }

  const userId = session.user.id

  const CURRENT_TERMS = getCurrentTerms()

  await db.$transaction(async (tx) => {
    for (const canvasId of selectedCanvasIds) {
      let course = await tx.course.findFirst({ where: { canvasId } })

      if (!course) {
        const raw = await tx.rawCanvasCourse.findUnique({
          where: { userId_canvasCourseId: { userId, canvasCourseId: canvasId } },
        })
        if (!raw || !raw.name) continue

        const courseCode = normalizeCourseCode(raw.courseCode ?? raw.name)
        const term = raw.term ?? extractSemester(raw.name, raw.courseCode ?? '')

        // Only allow current semester courses
        if (!CURRENT_TERMS.includes(term)) continue

        course = await tx.course.upsert({
          where: { courseCode_term: { courseCode, term } },
          create: {
            courseCode,
            courseName: raw.name,
            term,
            canvasId,
            enrollmentState: raw.enrollmentState ?? 'active',
            isCurrentSemester: true,
          },
          update: { canvasId },
        })
      } else if (course.term && !CURRENT_TERMS.includes(course.term)) {
        // Existing course but not current semester — skip
        continue
      }

      await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: course.id } },
        create: {
          userId,
          courseId: course.id,
          role: 'student',
          userSelected: true,
        },
        update: { userSelected: true },
      })
    }

    // Mark all other enrollments as deselected
    const selectedCourses = await tx.course.findMany({
      where: { canvasId: { in: selectedCanvasIds } },
      select: { id: true },
    })
    const selectedCourseIds = selectedCourses.map((c) => c.id)

    await tx.enrollment.updateMany({
      where: {
        userId,
        courseId: { notIn: selectedCourseIds },
      },
      data: { userSelected: false },
    })
  })

  // Build canvasId → courseId map for the frontend
  const selectedCourses = await db.course.findMany({
    where: { canvasId: { in: selectedCanvasIds } },
    select: { id: true, canvasId: true },
  })
  const courseMap: Record<string, string> = {}
  for (const c of selectedCourses) {
    if (c.canvasId) courseMap[c.canvasId] = c.id
  }

  // Trigger pipeline sync
  const pipelineUrl = process.env.PIPELINE_INTERNAL_URL
  if (pipelineUrl) {
    fetch(`${pipelineUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
      },
      body: JSON.stringify({ userId, services: ['canvas', 'gradescope', 'course_website'] }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, courseMap })
}
