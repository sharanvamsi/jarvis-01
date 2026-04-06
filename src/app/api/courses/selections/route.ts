import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/courses/selections
 *
 * Save the user's course selections from the settings page.
 * Accepts { selectedCanvasIds: string[] } — courses the user wants synced.
 * All other enrolled courses get userSelected=false.
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

  // Get all courses with matching canvasIds
  const courses = await db.course.findMany({
    where: { canvasId: { in: selectedCanvasIds } },
    select: { id: true, canvasId: true },
  })

  const selectedCourseIds = new Set(courses.map((c) => c.id))

  await db.$transaction(async (tx) => {
    // Mark selected enrollments
    for (const course of courses) {
      await tx.enrollment.upsert({
        where: {
          userId_courseId: { userId, courseId: course.id },
        },
        create: {
          userId,
          courseId: course.id,
          role: 'student',
          userSelected: true,
        },
        update: {
          userSelected: true,
        },
      })
    }

    // Mark all other enrollments as deselected
    await tx.enrollment.updateMany({
      where: {
        userId,
        courseId: { notIn: [...selectedCourseIds] },
      },
      data: { userSelected: false },
    })
  })

  // Trigger pipeline sync with updated selections
  const pipelineUrl = process.env.PIPELINE_INTERNAL_URL
  if (pipelineUrl) {
    fetch(`${pipelineUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
