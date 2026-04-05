import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

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
    const pipelineUrl = process.env.PIPELINE_INTERNAL_URL;
    if (pipelineUrl) {
      fetch(`${pipelineUrl}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': process.env.PIPELINE_SECRET!,
        },
        body: JSON.stringify({ userId: session.user.id }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onboarding] complete-simple error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
