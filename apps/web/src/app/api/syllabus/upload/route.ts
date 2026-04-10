import crypto from 'crypto';
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
    const contentHash = crypto.createHash('sha256').update(rawText).digest('hex');

    const syllabus = await db.$transaction(async (tx) => {
      const s = await tx.syllabus.upsert({
        where: { courseId },
        create: { courseId },
        update: {
          confirmedAt: null,
          confirmedBy: null,
          extractedAt: new Date(),
        },
      });

      await tx.syllabusDocument.upsert({
        where: { syllabusId: s.id },
        create: {
          syllabusId: s.id,
          source: 'upload',
          rawText,
          contentHash,
        },
        update: {
          source: 'upload',
          rawText,
          contentHash,
          fetchedAt: new Date(),
        },
      });

      return s;
    });

    return NextResponse.json({ success: true, syllabusId: syllabus.id });
  } catch (error) {
    console.error('[syllabus/upload] POST error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
