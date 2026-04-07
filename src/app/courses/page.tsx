export const revalidate = 300;

import { requireAuth, getUserCourses } from '@/lib/data'
import { CoursesClient } from '@/components/courses/CoursesClient'

export default async function CoursesPage() {
  const user = await requireAuth()
  const courses = await getUserCourses(user.id)
  return <CoursesClient courses={courses} />
}
