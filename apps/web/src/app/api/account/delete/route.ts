import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { reason } = await req.json().catch(() => ({ reason: null }));

    // Fetch the user before deletion for archival
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Wrap all operations in a transaction for consistency
    await db.$transaction(async (tx) => {
      // Archive to DeletedUser table
      await tx.deletedUser.create({
        data: {
          originalUserId: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          image: user.image,
          currentSemester: user.currentSemester,
          onboardingDone: user.onboardingDone,
          lastSyncAt: user.lastSyncAt,
          originalCreatedAt: user.createdAt,
          originalUpdatedAt: user.updatedAt,
          deletionReason: reason ?? null,
        },
      });

      // ExamStat rows cascade automatically now that userId is required and
      // the FK is ON DELETE CASCADE, but delete explicitly for clarity.
      await tx.examStat.deleteMany({ where: { userId } });

      // Delete manual assignments created by this user. These live in the shared
      // Assignment table, but onDelete: SetNull only nulls createdByUserId; the
      // rows must be removed so orphaned assignment data doesn't linger.
      // Cascades from Assignment will clean up their UserAssignment / ExamStat /
      // AssignmentGroupMapping / AssignmentOverride children automatically.
      await tx.assignment.deleteMany({ where: { createdByUserId: userId, source: 'manual' } });

      // Delete SyncMetadata (no cascade relation to User)
      await tx.syncMetadata.deleteMany({ where: { userId } });

      // Delete User — cascades all related tables (UserAssignment, Enrollment,
      // AssignmentOverride, CalendarEvent, SyncToken, SyncLog, raw tables, etc.)
      await tx.user.delete({ where: { id: userId } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[account/delete] error:', error);
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
  }
}
