import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { triggerPipelineSync } from '@/lib/sync'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { onboardingDone: true },
    })

    // Only sync services the user actually connected during onboarding
    const tokens = await db.syncToken.findMany({
      where: { userId: session.user.id },
      select: { service: true },
    })
    const connectedServices = tokens.map((t) => t.service)
    // Canvas is always connected at this point; also include calendar
    const services = ['canvas', 'calendar']
    if (connectedServices.includes('gradescope')) services.push('gradescope')
    if (connectedServices.includes('ed')) services.push('ed')

    await triggerPipelineSync(session.user.id, services)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[onboarding] complete error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
