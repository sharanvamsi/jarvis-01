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
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onboarding] complete-simple error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
