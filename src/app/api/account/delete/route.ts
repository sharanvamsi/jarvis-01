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

    // Archive to DeletedUser table
    await db.deletedUser.create({
      data: {
        originalUserId: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        image: user.image,
        currentSemester: user.currentSemester,
        onboardingDone: user.onboardingDone,
        gradescopeConnected: user.gradescopeConnected,
        lastSyncAt: user.lastSyncAt,
        originalCreatedAt: user.createdAt,
        originalUpdatedAt: user.updatedAt,
        deletionReason: reason ?? null,
      },
    });

    // Delete SyncMetadata (no cascade relation to User)
    await db.syncMetadata.deleteMany({ where: { userId } });

    // Delete User — cascades all 19 related tables
    await db.user.delete({ where: { id: userId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[account/delete] error:', error);
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
  }
}
