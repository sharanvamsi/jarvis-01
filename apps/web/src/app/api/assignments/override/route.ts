import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    assignmentId,
    excludeFromCalc,
    overrideMaxScore,
    overrideDueDate,
    overrideGroupId,
  } = await req.json();

  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
  }

  const assignment = await db.assignment.findFirst({
    where: {
      id: assignmentId,
      course: {
        enrollments: { some: { userId: session.user.id } }
      }
    }
  });

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  try {
    const override = await db.assignmentOverride.upsert({
      where: {
        assignmentId_userId: {
          assignmentId,
          userId: session.user.id,
        }
      },
      create: {
        assignmentId,
        userId: session.user.id,
        excludeFromCalc: excludeFromCalc ?? false,
        overrideMaxScore: overrideMaxScore ?? null,
        overrideDueDate: overrideDueDate ? new Date(overrideDueDate) : null,
        overrideGroupId: overrideGroupId ?? null,
      },
      update: {
        excludeFromCalc: excludeFromCalc ?? false,
        overrideMaxScore: overrideMaxScore ?? null,
        overrideDueDate: overrideDueDate ? new Date(overrideDueDate) : null,
        overrideGroupId: overrideGroupId ?? null,
      }
    });
    return NextResponse.json({ ok: true, override });
  } catch (error) {
    console.error('[override] upsert error:', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId } = await req.json();
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
  }

  try {
    await db.assignmentOverride.deleteMany({
      where: { assignmentId, userId: session.user.id }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
