import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pipeline-secret')
  if (secret !== process.env.PIPELINE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  // Revalidate all page routes so they pick up fresh data
  revalidatePath('/')
  revalidatePath('/grades')
  revalidatePath('/courses')
  revalidatePath('/calendar')

  return NextResponse.json({ ok: true, revalidated: true })
}
