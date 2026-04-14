export const revalidate = 300;

import { requireAuth, getGradesPageData } from '@/lib/data'
import { GradesClient } from '@/components/grades/GradesClient'

export default async function GradesPage() {
  const user = await requireAuth()
  const courses = await getGradesPageData(user.id)
  return <GradesClient courses={courses} />
}
