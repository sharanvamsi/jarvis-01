import { requireAuth, getCourseById, hasEdToken } from '@/lib/data'
import { CourseDetailClient } from '@/components/courses/CourseDetailClient'
import { notFound } from 'next/navigation'

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()
  const [course, edConnected] = await Promise.all([
    getCourseById(id, user.id),
    hasEdToken(user.id),
  ])
  if (!course) notFound()
  return <CourseDetailClient course={course} edConnected={edConnected} />
}
