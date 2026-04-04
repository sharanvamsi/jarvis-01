import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { confirmSyllabus } from '@/lib/data'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { syllabusId } = await req.json()
  if (!syllabusId) {
    return NextResponse.json({ error: 'Missing syllabusId' }, { status: 400 })
  }
  const result = await confirmSyllabus(syllabusId, session.user.id)
  return NextResponse.json({ ok: !!result })
}
