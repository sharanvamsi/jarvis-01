import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { triggerPipelineSync } from '@/lib/sync';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { onboardingDone: true },
    });

    // Trigger a sync for calendar (Google account is already connected at this point)
    triggerPipelineSync(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onboarding] complete-simple error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
