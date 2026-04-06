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

    // Respect userSelected: if user has selections, show only those
    const selectedCount = await db.enrollment.count({
      where: { userId, userSelected: true },
    });

    const enrollments = await db.enrollment.findMany({
      where: {
        userId,
        ...(selectedCount > 0
          ? { userSelected: true }
          : { course: { isCurrentSemester: true } }),
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
                source: true,
                confirmedAt: true,
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
        syllabusSource: c.syllabus?.source ?? null,
        syllabusConfirmed: !!c.syllabus?.confirmedAt,
      }));

    return NextResponse.json({ courses });
  } catch (error) {
    console.error('[courses] GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
