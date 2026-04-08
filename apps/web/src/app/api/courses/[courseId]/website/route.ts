import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await params;
  const { url } = await req.json();

  // Verify enrollment
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  });

  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
  }

  // Validate URL if provided
  if (url !== null && url !== '') {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
  }

  try {
    const normalizedUrl = url && url.trim() !== ''
      ? (url.startsWith('http') ? url.trim() : `https://${url.trim()}`)
      : null;

    await db.course.update({
      where: { id: courseId },
      data: { websiteUrl: normalizedUrl },
    });

    return NextResponse.json({ success: true, websiteUrl: normalizedUrl });
  } catch (error) {
    console.error('[courses/website] PATCH error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
