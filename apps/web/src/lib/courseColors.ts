const COURSE_COLORS: Record<string, string> = {
  'CS 162': '#3B82F6',
  'CS 189': '#8B5CF6',
  'UGBA 102A': '#F59E0B',
  'UGBA 103': '#10B981',
}

const DEFAULT_COLOR = '#6B7280'

export function getCourseColor(courseCode: string | null | undefined): string {
  if (!courseCode) return DEFAULT_COLOR
  if (COURSE_COLORS[courseCode]) return COURSE_COLORS[courseCode]
  return DEFAULT_COLOR
}
