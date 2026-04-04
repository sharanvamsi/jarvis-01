import { requireAuth, getCourseById } from '@/lib/data'
import { CourseDetailClient } from '@/components/courses/CourseDetailClient'
import { notFound } from 'next/navigation'

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireAuth()
  const course = await getCourseById(id, user.id)
  if (!course) notFound()
  return <CourseDetailClient course={course} />
}
