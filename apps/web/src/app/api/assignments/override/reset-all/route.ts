import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await req.json();

  try {
    const result = await db.assignmentOverride.deleteMany({
      where: {
        userId: session.user.id,
        ...(courseId ? { assignment: { courseId } } : {})
      }
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
