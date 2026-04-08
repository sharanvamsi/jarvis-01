import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId, rawText } = await req.json();

  if (!courseId || !rawText) {
    return NextResponse.json({ error: 'courseId and rawText required' }, { status: 400 });
  }

  // Verify enrollment
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  });

  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
  }

  try {
    const syllabus = await db.syllabus.upsert({
      where: { courseId },
      create: {
        courseId,
        source: 'upload',
        rawText,
      },
      update: {
        source: 'upload',
        rawText,
        confirmedAt: null,
        confirmedBy: null,
      },
    });

    return NextResponse.json({ success: true, syllabusId: syllabus.id });
  } catch (error) {
    console.error('[syllabus/upload] POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
