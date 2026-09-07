import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/encrypt'
import { fetchCanvasCourses } from '@/lib/canvas-utils'
import { observeUserSemester } from '@jarvis/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { token } = await req.json()
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  // Load user's current semester
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { currentSemester: true },
  })
  const currentSemester = user?.currentSemester ?? ''

  // Validate token by fetching courses from Canvas
  let discovery
  try {
    discovery = await fetchCanvasCourses(token, currentSemester)
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid Canvas token or Canvas is unreachable' },
      { status: 400 }
    )
  }

  const observedSemester = await observeUserSemester(
    db,
    session.user.id,
    [discovery.observedSemester],
    'canvas-onboarding'
  )

  // Token is valid — encrypt and save
  const encrypted = encrypt(token.trim())
  await db.syncToken.upsert({
    where: {
      userId_service: {
        userId: session.user.id,
        service: 'canvas',
      },
    },
    update: { accessToken: encrypted },
    create: {
      userId: session.user.id,
      service: 'canvas',
      accessToken: encrypted,
    },
  })

  return NextResponse.json({ success: true, courses: discovery.courses, currentSemester: observedSemester })
}
