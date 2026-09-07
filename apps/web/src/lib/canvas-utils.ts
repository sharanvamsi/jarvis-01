// Canvas course utilities — copied from jarvis-pipeline/src/lib/normalize.ts
// The two repos share no dependencies, so these pure functions are duplicated here.

import { parseSemester, latestSemester } from '@jarvis/db'
const CANVAS_API_BASE = 'https://bcourses.berkeley.edu/api/v1'

const DEPT_ALIASES: Record<string, string> = {
  'COMPSCI': 'CS',
  'EECS': 'EECS',
}

const COURSE_ALIASES: Record<string, string> = {
  'EECS 189': 'CS 189',
  'CS 189/289A': 'CS 189',
}

const NON_ACADEMIC_NAME_MARKERS = [
  'orientation', 'golden bear', 'shape', 'advising', 'sell out',
]

const NON_ACADEMIC_CODE_PREFIXES = ['GBA', 'GBO', 'GBP', 'SHAPE']

const SKIP_SUBSTRINGS = [
  'ORIENTATION', 'ENROLLMENT COURSE', 'GOLDEN BEAR PREP',
  'GOLDEN BEAR ORIENTATION', 'GOLDEN BEAR ADVISING',
]

export function normalizeCourseCode(code: string): string {
  let normalized = code.trim().toUpperCase()
  normalized = normalized.replace(/-+$/, '')
  normalized = normalized.replace(/\s*(?:WI|SP|FA|SU)\d{2}$/i, '')
  normalized = normalized.replace(/-(?:LEC|DIS|LAB|SEM|IND|FLD|REC|TUT)-\d+/g, '')
  normalized = normalized.replace(/\s*&\s*\d+/g, '')
  normalized = normalized.replace(/\/\w+$/, '')
  normalized = normalized.replace(/-+$/, '')
  normalized = normalized.replace(/^([A-Z]+)(\d)/, '$1 $2')
  for (const [alias, canonical] of Object.entries(DEPT_ALIASES)) {
    if (normalized.startsWith(alias + ' ')) {
      normalized = canonical + normalized.slice(alias.length)
    }
  }
  if (COURSE_ALIASES[normalized]) {
    normalized = COURSE_ALIASES[normalized]
  }
  return normalized.trim()
}

export function extractSemester(courseName: string, courseCode: string): string {
  return parseSemester(courseName) ?? parseSemester(courseCode) ?? 'UNKNOWN'
}

export function isNonAcademicCourse(name: string, code: string): boolean {
  const lowerName = name.toLowerCase()
  const upperCode = code.toUpperCase()
  if (NON_ACADEMIC_NAME_MARKERS.some(m => lowerName.includes(m))) return true
  if (NON_ACADEMIC_CODE_PREFIXES.some(p => upperCode.startsWith(p))) return true
  const upperName = name.toUpperCase()
  if (SKIP_SUBSTRINGS.some(s => upperName.includes(s))) return true
  return false
}

export function isCurrentCourse(name: string, code: string, currentSemester: string): boolean {
  return parseSemester(currentSemester) !== null && extractSemester(name, code) === parseSemester(currentSemester)
}

export interface OnboardingCourse {
  canvasId: string
  courseCode: string
  courseName: string
  term: string
}

export interface CanvasCourseDiscovery {
  courses: OnboardingCourse[]
  observedSemester: string
}

/**
 * Fetch current-semester courses from Canvas API using the provided token.
 * Does NOT save the token — caller is responsible for that.
 */
export async function fetchCanvasCourses(
  token: string,
  currentSemester: string
): Promise<CanvasCourseDiscovery> {
  const res = await fetch(
    `${CANVAS_API_BASE}/courses?enrollment_state=active&per_page=50&include[]=term`,
    {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: AbortSignal.timeout(15000),
    }
  )

  if (!res.ok) {
    throw new Error(`Canvas API returned ${res.status}`)
  }

  const courses = (await res.json()) as Array<{
    id: number
    name: string
    course_code?: string
    enrollments?: Array<{ enrollment_state: string }>
  }>

  const recognized = courses
    .filter(course => course.name && !isNonAcademicCourse(course.name, course.course_code || ''))
    .map(course => extractSemester(course.name, course.course_code || ''))
    .filter(term => term !== 'UNKNOWN')
  const observedSemester = latestSemester(recognized, currentSemester) ?? currentSemester
  const result: OnboardingCourse[] = []
  const seenCodes = new Set<string>()

  for (const course of courses) {
    if (!course.name) continue
    const code = course.course_code || ''

    if (isNonAcademicCourse(course.name, code)) continue
    if (!isCurrentCourse(course.name, code, observedSemester)) continue

    const normalizedCode = normalizeCourseCode(code || course.name)
    const term = extractSemester(course.name, code)

    // Deduplicate by normalized code (cross-listed courses)
    const dedup = `${normalizedCode}__${term}`
    if (seenCodes.has(dedup)) continue
    seenCodes.add(dedup)

    result.push({
      canvasId: String(course.id),
      courseCode: normalizedCode,
      courseName: course.name,
      term,
    })
  }

  return { courses: result, observedSemester }
}
