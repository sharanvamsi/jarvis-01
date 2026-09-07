import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const user = await db.user.findUnique({ where: { id: userId }, select: { currentSemester: true } });

    // Respect userSelected: if user has selections, show only those
    const selectedCount = await db.enrollment.count({
      where: { userId, userSelected: true, course: { term: user?.currentSemester } },
    });

    const enrollments = await db.enrollment.findMany({
      where: {
        userId,
        ...(selectedCount > 0
          ? { userSelected: true }
          : {}),
        course: { term: user?.currentSemester ?? 'UNKNOWN' },
      },
      include: {
        course: {
          select: {
            id: true,
            courseCode: true,
            courseName: true,
            websiteUrl: true,
            isCurrentSemester: true,
            syllabus: {
              select: {
                id: true,
                confirmedAt: true,
                document: { select: { source: true } },
              },
            },
          },
        },
      },
    });

    const courses = enrollments
      .map((e) => e.course)
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode))
      .map((c) => ({
        id: c.id,
        courseCode: c.courseCode,
        courseName: c.courseName,
        websiteUrl: c.websiteUrl,
        hasSyllabus: !!c.syllabus,
        syllabusSource: c.syllabus?.document?.source ?? null,
        syllabusConfirmed: !!c.syllabus?.confirmedAt,
      }));

    return NextResponse.json({ courses });
  } catch (error) {
    console.error('[courses] GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
