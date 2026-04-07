import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    courseId,
    name,
    pointsPossible,
    score,
    dueDate,
    groupId,
    assignmentType,
  } = await req.json()

  if (!courseId || !name?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify user is enrolled in this course
  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, courseId },
  })
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  try {
    const assignment = await db.$transaction(async (tx) => {
      const a = await tx.assignment.create({
        data: {
          courseId,
          name: name.trim(),
          assignmentType: assignmentType ?? 'other',
          pointsPossible: pointsPossible ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
          source: 'manual',
          createdByUserId: session.user!.id!,
          isCurrentSemester: true,
          submissionTypes: [],
        },
      })

      if (score !== null && score !== undefined) {
        await tx.userAssignment.create({
          data: {
            userId: session.user!.id!,
            assignmentId: a.id,
            score,
            maxScore: pointsPossible ?? null,
            status: 'graded',
          },
        })
      }

      if (groupId) {
        await tx.assignmentGroupMapping.create({
          data: {
            assignmentId: a.id,
            componentGroupId: groupId,
          },
        })
      }

      return a
    })

    return NextResponse.json({ ok: true, assignmentId: assignment.id })
  } catch (error) {
    console.error('[create assignment] error:', error)
    return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  }
}
