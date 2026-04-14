'use client'

import { useState, useCallback } from 'react'
import { getCourseColor } from '@/lib/courseColors'
import GradeSandbox from '@/components/grades/GradeSandbox'
import BTHistoricalSection from '@/components/grades/BTHistoricalSection'

type BTSnapshot = {
  id: string
  year: number
  semester: string
  instructor: string | null
  average: number | null
  pnpPercentage: number | null
  distribution: { letter: string; percentage: number; count: number }[]
}

type GradeAssignment = {
  id: string
  name: string
  dueDate: string | null
  pointsPossible: number | null
  score: number | null
  status: string
  isLate: boolean
  assignmentType: string | null
  source: string
  groupName: string | null
  override: {
    excludeFromCalc: boolean
    overrideMaxScore: number | null
    overrideDueDate: string | null
    overrideGroupId: string | null
  } | null
}

type SyllabusComponentGroup = {
  id: string
  name: string
  weight: number
  dropLowest: number
  isBestOf: boolean
  isExam: boolean
  assignmentIds: string[]
}

type SyllabusData = {
  id: string
  isCurved: boolean
  isPointsBased: boolean
  totalPoints: number | null
  curveDescription: string | null
  confirmedAt: string | null
  componentGroups: SyllabusComponentGroup[]
  gradeScale: {
    letter: string
    minScore: number
    maxScore: number
    isPoints: boolean
  }[]
  clobberPolicies: {
    sourceName: string
    targetName: string
    comparisonType: 'raw' | 'zscore'
    conditionText: string
  }[]
  examStats: {
    assignmentId: string
    mean: number
    stdDev: number
  }[]
}

type CourseGradeData = {
  id: string
  courseCode: string
  courseName: string
  assignments: GradeAssignment[]
  btSnapshots: BTSnapshot[]
  syllabus: SyllabusData | null
}

interface Props {
  courses: CourseGradeData[]
}

export function GradesClient({ courses }: Props) {
  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.id ?? '')
  const [projectedLetter, setProjectedLetter] = useState<string | null>(null)
  const [breakdownExpanded, setBreakdownExpanded] = useState(false)
  const [selectedSnapshot, setSelectedSnapshot] = useState<BTSnapshot | null>(null)
  const handleSnapshotChange = useCallback((s: BTSnapshot | null) => setSelectedSnapshot(s), [])

  const course = courses.find((c) => c.id === selectedCourse)

  if (courses.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
        <div className="max-w-[1200px] mx-auto p-4 md:p-8">
          <h1 className="text-[28px] font-medium text-[#F5F5F5] mb-8">Grades</h1>
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-8 text-center">
            <p className="text-[#A3A3A3] text-sm">
              No grades available yet. Grades will appear once your courses sync.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1200px] mx-auto p-4 md:p-8">
        {/* Header */}
        <h1 className="text-[28px] font-medium text-[#F5F5F5] mb-6">Grades</h1>

        {/* Course tabs */}
        <div className="border-b border-[#1F1F1F] mb-6">
          <div className="flex gap-1 overflow-x-auto pb-px">
            {courses.map((c) => {
              const color = getCourseColor(c.courseCode)
              const isActive = c.id === selectedCourse
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCourse(c.id); setProjectedLetter(null) }}
                  className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'text-[#F5F5F5]'
                      : 'border-transparent text-[#A3A3A3] hover:text-[#F5F5F5]'
                  }`}
                  style={isActive ? { borderBottomColor: color, color } : undefined}
                >
                  {c.courseCode}
                </button>
              )
            })}
          </div>
        </div>

        {/* Per-course view */}
        {course && (
          <div>
            {/* Course name subtitle */}
            <p className="text-[#A3A3A3] text-sm mb-4">{course.courseName}</p>

            {/* Section A: Historical Context */}
            <BTHistoricalSection key={course.id} snapshots={course.btSnapshots} markerLetter={projectedLetter} onSnapshotChange={handleSnapshotChange} />

            {/* Divider */}
            <div className="border-t border-[#1F1F1F] my-6" />

            {/* Section B: Grade Sandbox */}
            <div>
              <h3 className="text-sm font-medium text-[#F5F5F5] mb-3">Grade Sandbox</h3>
              <GradeSandbox
                key={course.id}
                assignments={course.assignments}
                syllabus={course.syllabus}
                courseCode={course.courseCode}
                courseId={course.id}
                btSnapshots={course.btSnapshots}
                btSnapshot={selectedSnapshot}
                onProjectionChange={setProjectedLetter}
                breakdownExpanded={breakdownExpanded}
                onBreakdownToggle={() => setBreakdownExpanded(v => !v)}
                componentGroups={course.syllabus?.componentGroups.map(g => ({
                  id: g.id,
                  name: g.name,
                  weight: g.weight,
                })) ?? []}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
