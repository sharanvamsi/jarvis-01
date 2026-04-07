import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { upsertExamStatManual } from '@/lib/data'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { assignmentId, mean, stdDev } = await req.json()
  if (!assignmentId || mean == null || stdDev == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify the user is enrolled in the course that owns this assignment
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { courseId: true },
  })
  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId: assignment.courseId } },
  })
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  const result = await upsertExamStatManual(assignmentId, mean, stdDev, session.user.id)
  return NextResponse.json({ ok: !!result })
}
