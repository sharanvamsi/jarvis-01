import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { confirmSyllabus } from '@/lib/data'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { syllabusId } = await req.json()
  if (!syllabusId || typeof syllabusId !== 'string') {
    return NextResponse.json({ error: 'Invalid syllabusId' }, { status: 400 })
  }

  // Verify user is enrolled in the course that owns this syllabus
  const syllabus = await db.syllabus.findUnique({
    where: { id: syllabusId },
    select: { courseId: true },
  })
  if (!syllabus) {
    return NextResponse.json({ error: 'Syllabus not found' }, { status: 404 })
  }
  const enrollment = await db.enrollment.findFirst({
    where: { userId: session.user.id, courseId: syllabus.courseId },
  })
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  const result = await confirmSyllabus(syllabusId, session.user.id)
  return NextResponse.json({ ok: !!result })
}
