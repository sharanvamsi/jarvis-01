import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { triggerPipelineSync } from '@/lib/sync'

interface CourseSelection {
  canvasId: string
  courseCode: string
  courseName: string
  term: string
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { courses } = (await req.json()) as { courses: CourseSelection[] }
  if (!courses?.length) {
    return NextResponse.json({ error: 'No courses selected' }, { status: 400 })
  }

  try {
    await db.$transaction(async (tx) => {
      for (const course of courses) {
        // Check if course already exists to protect its canvasId
        const existing = await tx.course.findUnique({
          where: {
            courseCode_term: {
              courseCode: course.courseCode,
              term: course.term,
            },
          },
          select: { canvasId: true },
        })

        // Upsert Course record (shared across all users)
        // Only set canvasId on create, or if not already set
        const upserted = await tx.course.upsert({
          where: {
            courseCode_term: {
              courseCode: course.courseCode,
              term: course.term,
            },
          },
          create: {
            courseCode: course.courseCode,
            courseName: course.courseName,
            term: course.term,
            canvasId: course.canvasId,
            isCurrentSemester: true,
            enrollmentState: 'active',
          },
          update: {
            isCurrentSemester: true,
            enrollmentState: 'active',
            ...(existing?.canvasId ? {} : { canvasId: course.canvasId }),
          },
        })

        // Create enrollment for this user
        await tx.enrollment.upsert({
          where: {
            userId_courseId: {
              userId: session.user.id,
              courseId: upserted.id,
            },
          },
          create: {
            userId: session.user.id,
            courseId: upserted.id,
            role: 'student',
            userSelected: true,
          },
          update: {
            userSelected: true,
          },
        })
      }

      // Mark onboarding as complete
      await tx.user.update({
        where: { id: session.user.id },
        data: { onboardingDone: true },
      })
    })

    // Trigger pipeline sync now that courses are selected
    triggerPipelineSync(session.user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[onboarding] complete error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
