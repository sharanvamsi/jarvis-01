'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import SyllabusConfirmation from '@/components/grades/SyllabusConfirmation'
import SyllabusManualEntry from '@/components/grades/SyllabusManualEntry'
import GradeBreakdown from '@/components/grades/GradeBreakdown'
import ExamStatEntry from '@/components/grades/ExamStatEntry'
import {
  computeProjection,
  type ProjectionGroup,
  type ProjectionAssignment,
  type ProjectionResult,
  type AssignmentStatus,
} from '@/lib/projection'

// ── Types ────────────────────────────────────────────────────

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

type BTSnapshot = {
  id: string
  year: number
  semester: string
  instructor: string | null
  average: number | null
  pnpPercentage: number | null
  distribution: { letter: string; percentage: number; count: number }[]
}

interface Props {
  assignments: GradeAssignment[]
  syllabus: SyllabusData | null
  courseCode: string
  courseId: string
  btSnapshots: BTSnapshot[]
  btSnapshot?: BTSnapshot | null
  onProjectionChange?: (letter: string | null) => void
  breakdownExpanded: boolean
  onBreakdownToggle: () => void
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'graded':
      return 'bg-emerald-500/10 text-emerald-400'
    case 'submitted':
      return 'bg-blue-500/10 text-blue-400'
    case 'missing':
      return 'bg-red-500/10 text-red-400'
    case 'late':
      return 'bg-amber-500/10 text-amber-400'
    default:
      return 'bg-[#1F1F1F] text-[#A3A3A3]'
  }
}

function confidenceColor(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high') return 'text-emerald-500'
  if (c === 'medium') return 'text-amber-500'
  return 'text-[#525252]'
}

function computeZScore(score: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0
  return (score - mean) / stdDev
}

function formatZScore(z: number): string {
  const sign = z >= 0 ? '+' : ''
  return `${sign}${z.toFixed(2)}\u03C3`
}

// ── Component ────────────────────────────────────────────────

export default function GradeSandbox({
  assignments,
  syllabus,
  courseCode,
  courseId,
  btSnapshots,
  btSnapshot,
  onProjectionChange,
  breakdownExpanded,
  onBreakdownToggle,
}: Props) {
  const router = useRouter()

  // Compute initial scores from assignment data
  function getInitialScores(): Record<string, string> {
    const init: Record<string, string> = {}
    for (const a of assignments) {
      if (a.status === 'graded' && a.score != null) {
        init[a.id] = String(a.score)
      } else if (a.status === 'missing') {
        init[a.id] = '0'
      }
    }
    return init
  }

  // Editable scores
  const [editedScores, setEditedScores] = useState<Record<string, string>>(getInitialScores)
  const initialScoresRef = useRef(getInitialScores())

  // Track if user has made edits
  const hasEdits = useMemo(() => {
    const initial = initialScoresRef.current
    return Object.keys(editedScores).some(
      id => editedScores[id] !== (initial[id] ?? '')
    ) || Object.keys(initial).some(
      id => !(id in editedScores)
    )
  }, [editedScores])

  const handleReset = useCallback(() => {
    setEditedScores(getInitialScores())
  }, [assignments])

  // Syllabus confirmation state
  const [showConfirmModal, setShowConfirmModal] = useState(
    () => !!syllabus && !syllabus.confirmedAt
  )
  const [isConfirmed, setIsConfirmed] = useState(
    () => !!syllabus?.confirmedAt
  )
  const [showManualEntry, setShowManualEntry] = useState(false)

  // Track which exam row has stat entry expanded
  const [expandedStatEntry, setExpandedStatEntry] = useState<string | null>(null)

  // Local exam stats (updated from manual entry)
  const [localExamStats, setLocalExamStats] = useState<
    Record<string, { mean: number; stdDev: number }>
  >(() => {
    const init: Record<string, { mean: number; stdDev: number }> = {}
    for (const es of syllabus?.examStats ?? []) {
      init[es.assignmentId] = { mean: es.mean, stdDev: es.stdDev }
    }
    return init
  })

  // BT distribution: use prop from BTHistoricalSection, fallback to all-time
  const allTimeBT = btSnapshots.find(
    (s) => s.year === 0 && s.semester === 'All' && s.instructor === null
  )
  const selectedBT = btSnapshot ?? allTimeBT ?? null

  const handleScoreChange = useCallback(
    (id: string, value: string) => {
      if (value !== '' && !/^\d*\.?\d*$/.test(value)) return
      setEditedScores((prev) => ({ ...prev, [id]: value }))
    },
    []
  )

  const handleExamStatSaved = useCallback(
    (assignmentId: string, mean: number, stdDev: number) => {
      setLocalExamStats((prev) => ({
        ...prev,
        [assignmentId]: { mean, stdDev },
      }))
    },
    []
  )

  // ── Projection computation ─────────────────────────────────

  const projection: ProjectionResult | null = useMemo(() => {
    if (!syllabus || !isConfirmed) return null

    // Build a map of overrideGroupId -> target group for reassigned assignments
    const overrideGroupAssignments = new Map<string, ProjectionAssignment[]>()

    const groups: ProjectionGroup[] = syllabus.componentGroups.map((g) => {
      const groupAssignments: ProjectionAssignment[] = []
      for (const aid of g.assignmentIds) {
        const a = assignments.find((x) => x.id === aid)
        if (!a) continue
        const override = a.override
        const editedVal = editedScores[a.id]
        const hypotheticalScore =
          editedVal !== undefined && editedVal !== ''
            ? parseFloat(editedVal)
            : null
        const stat = localExamStats[a.id] ?? null
        const pa: ProjectionAssignment = {
          id: a.id,
          name: a.name,
          score: a.score,
          maxScore: a.pointsPossible,
          status: a.status as AssignmentStatus,
          assignmentType: a.assignmentType ?? '',
          hypotheticalScore:
            a.status === 'graded' && hypotheticalScore === a.score
              ? null
              : hypotheticalScore,
          examStat: stat
            ? { mean: stat.mean, stdDev: stat.stdDev }
            : null,
          excludeFromCalc: override?.excludeFromCalc ?? false,
          overrideMaxScore: override?.overrideMaxScore ?? null,
          overrideGroupId: override?.overrideGroupId ?? null,
        }

        // If assignment is reassigned to a different group, route it there
        if (override?.overrideGroupId && override.overrideGroupId !== g.id) {
          const targetList = overrideGroupAssignments.get(override.overrideGroupId) ?? []
          targetList.push(pa)
          overrideGroupAssignments.set(override.overrideGroupId, targetList)
        } else {
          groupAssignments.push(pa)
        }
      }
      return {
        id: g.id,
        name: g.name,
        weight: g.weight,
        dropLowest: g.dropLowest,
        isBestOf: g.isBestOf,
        isExam: g.isExam,
        assignments: groupAssignments,
      }
    })

    // Merge reassigned assignments into their target groups
    for (const group of groups) {
      const extras = overrideGroupAssignments.get(group.id)
      if (extras) {
        group.assignments.push(...extras)
      }
    }

    return computeProjection({
      isCurved: syllabus.isCurved,
      isPointsBased: syllabus.isPointsBased,
      totalPoints: syllabus.totalPoints,
      groups,
      clobberPolicies: syllabus.clobberPolicies,
      gradeScale: syllabus.gradeScale.length > 0 ? syllabus.gradeScale : null,
      btDistribution: selectedBT?.distribution ?? null,
    })
  }, [
    syllabus,
    isConfirmed,
    assignments,
    editedScores,
    localExamStats,
    selectedBT,
  ])

  // Notify parent when projected letter changes
  useEffect(() => {
    onProjectionChange?.(projection?.projectedLetter ?? null)
  }, [projection?.projectedLetter, onProjectionChange])

  // Count graded / total
  const gradedCount = assignments.filter(
    (a) => a.status === 'graded'
  ).length
  const upcomingCount = assignments.filter(
    (a) => a.status === 'ungraded' || a.status === 'submitted'
  ).length

  // Get group name for an assignment
  const assignmentGroupMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const g of syllabus?.componentGroups ?? []) {
      for (const aid of g.assignmentIds) {
        map[aid] = g.name
      }
    }
    return map
  }, [syllabus])


  return (
    <div>
      {/* Manual entry modal */}
      {showManualEntry && (
        <SyllabusManualEntry
          courseCode={courseCode}
          courseId={courseId}
          existingSyllabusId={syllabus?.id}
          existingGroups={syllabus?.componentGroups.map((g) => ({
            name: g.name,
            weight: g.weight,
            dropLowest: g.dropLowest,
            isExam: g.isExam,
            isBestOf: g.isBestOf,
          }))}
          existingClobberPolicies={syllabus?.clobberPolicies}
          existingIsCurved={syllabus?.isCurved}
          existingCurveDescription={syllabus?.curveDescription}
          onSaved={() => {
            setShowManualEntry(false)
            setIsConfirmed(true)
            router.refresh()
          }}
          onDismiss={() => setShowManualEntry(false)}
        />
      )}

      {/* Syllabus confirmation modal */}
      {showConfirmModal && syllabus && (
        <SyllabusConfirmation
          courseCode={courseCode}
          syllabusId={syllabus.id}
          isCurved={syllabus.isCurved}
          curveDescription={syllabus.curveDescription}
          componentGroups={syllabus.componentGroups.map((g) => ({
            id: g.id,
            name: g.name,
            weight: g.weight,
            dropLowest: g.dropLowest,
            isExam: g.isExam,
            assignmentCount: g.assignmentIds.length,
          }))}
          clobberPolicies={syllabus.clobberPolicies}
          onConfirm={() => {
            setIsConfirmed(true)
            setShowConfirmModal(false)
          }}
          onDismiss={() => setShowConfirmModal(false)}
        />
      )}

      {/* Projected grade banner */}
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md px-4 py-3 mb-4">
        {!syllabus ? (
          // No syllabus at all — prompt manual entry
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#F5F5F5]">Grade projection unavailable</p>
              <p className="text-xs text-[#525252] mt-0.5">
                Enter your syllabus weights to see your projected grade
              </p>
            </div>
            <button
              onClick={() => { setShowConfirmModal(false); setShowManualEntry(true) }}
              className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-4"
            >
              Enter weights &rarr;
            </button>
          </div>
        ) : !isConfirmed ? (
          // Syllabus exists but not confirmed
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#A3A3A3]">Projected Grade</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-medium text-[#F5F5F5]">--</span>
              <button
                onClick={() => setShowConfirmModal(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Review grade weights &rarr;
              </button>
            </div>
          </div>
        ) : projection ? (
          // Projection available
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#A3A3A3]">Projected Grade</span>
              <div className="flex items-center gap-3">
                {projection.projectedLetter ? (
                  <>
                    <span className="text-lg font-medium text-[#F5F5F5]">
                      {projection.projectedLetter}
                    </span>
                    {projection.method === 'weighted' &&
                      projection.projectedPct !== null && (
                        <span className="text-sm text-[#A3A3A3]">
                          {projection.projectedPct}%
                        </span>
                      )}
                    {projection.method === 'curved' &&
                      projection.projectedPercentile !== null && (
                        <span className="text-sm text-[#A3A3A3]">
                          {projection.projectedPercentile}th percentile
                        </span>
                      )}
                    <span
                      className={`text-xs ${confidenceColor(projection.confidence)}`}
                    >
                      ● {projection.confidence}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-medium text-[#F5F5F5]">
                    --
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-[#525252]">
                {projection.method === 'weighted'
                  ? `Based on ${gradedCount} of ${assignments.length} graded assignments (${upcomingCount} upcoming)`
                  : projection.disclaimer ?? ''}
              </span>
              {/* BT distribution info — driven by BTHistoricalSection */}
              {syllabus?.isCurved && selectedBT && (
                <span className="text-[11px] text-[#525252]">
                  Using: {selectedBT.year === 0 ? 'All Time' : `${selectedBT.semester} ${selectedBT.year}`}
                  {selectedBT.instructor ? ` (${selectedBT.instructor})` : ''}
                </span>
              )}
            </div>
            {/* Missing stats hint */}
            {projection.pendingExams.length > 0 && syllabus?.isCurved && (
              <span className="text-xs text-[#525252] mt-1.5 block">
                Enter exam statistics above to see projection
              </span>
            )}
            <button
              onClick={() => { setShowConfirmModal(false); setShowManualEntry(true) }}
              className="text-[11px] text-[#525252] hover:text-[#A3A3A3] mt-1"
            >
              Edit weights
            </button>
          </div>
        ) : (
          // Fallback
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#A3A3A3]">Projected Grade</span>
            <span className="text-lg font-medium text-[#F5F5F5]">--</span>
          </div>
        )}
      </div>

      {/* Grade breakdown */}
      {projection && projection.breakdown.length > 0 && (
        <GradeBreakdown
          breakdown={projection.breakdown}
          method={projection.method}
          isPointsBased={syllabus?.isPointsBased}
          expanded={breakdownExpanded}
          onToggle={onBreakdownToggle}
        />
      )}

      {/* Reset button + table header */}
      {hasEdits && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-[#525252] hover:text-[#A3A3A3] transition-colors"
          >
            <RotateCcw size={11} />
            Reset scores
          </button>
        </div>
      )}

      {/* Assignment table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1F1F1F]">
              <th className="text-left p-3 text-[#A3A3A3] text-xs font-medium">
                Assignment
              </th>
              {syllabus && isConfirmed && (
                <th className="text-left p-3 text-[#A3A3A3] text-xs font-medium hidden md:table-cell">
                  Group
                </th>
              )}
              <th className="text-left p-3 text-[#A3A3A3] text-xs font-medium hidden sm:table-cell">
                Due
              </th>
              <th className="text-right p-3 text-[#A3A3A3] text-xs font-medium w-20">
                Score
              </th>
              <th className="text-center p-3 text-[#A3A3A3] text-xs font-medium w-16">
                Max
              </th>
              <th className="text-center p-3 text-[#A3A3A3] text-xs font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td
                  colSpan={syllabus && isConfirmed ? 6 : 5}
                  className="p-6 text-center text-[#525252] text-sm"
                >
                  No assignments
                </td>
              </tr>
            ) : (
              assignments.filter(a => !a.override?.excludeFromCalc).map((a) => {
                const groupName = assignmentGroupMap[a.id]
                const isExamRow =
                  syllabus?.isCurved &&
                  isConfirmed &&
                  syllabus.componentGroups.some(
                    (g) => g.isExam && g.assignmentIds.includes(a.id)
                  )
                const examStat = localExamStats[a.id] ?? null
                const isExcluded = a.override?.excludeFromCalc === true
                const effectiveMax = a.override?.overrideMaxScore ?? a.pointsPossible
                const maxIsOverridden = a.override?.overrideMaxScore != null && a.override.overrideMaxScore !== a.pointsPossible

                return (
                  <tr
                    key={a.id}
                    className={`border-b border-[#1F1F1F] last:border-0 ${isExcluded ? 'opacity-50' : ''}`}
                  >
                    <td className="p-3">
                      <div className={`text-sm truncate max-w-[200px] sm:max-w-[300px] ${isExcluded ? 'text-[#525252] line-through' : 'text-[#F5F5F5]'}`}>
                        {a.name}
                      </div>
                      <div className="text-[#525252] text-xs sm:hidden">
                        {formatDate(a.dueDate)}
                      </div>
                      {/* Exam stat entry for curved courses */}
                      {isExamRow && !examStat && expandedStatEntry !== a.id && (
                        <div className="flex items-center gap-1.5 text-[11px] mt-1">
                          <span className="text-amber-500">Stats needed</span>
                          <button
                            onClick={() => setExpandedStatEntry(a.id)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            Enter from Ed &rarr;
                          </button>
                        </div>
                      )}
                      {isExamRow && (examStat || expandedStatEntry === a.id) && (
                        <div className="mt-1">
                          <ExamStatEntry
                            assignmentName={a.name}
                            assignmentId={a.id}
                            existingStat={examStat}
                            onSaved={(mean, stdDev) => {
                              handleExamStatSaved(a.id, mean, stdDev)
                              setExpandedStatEntry(null)
                            }}
                          />
                        </div>
                      )}
                    </td>
                    {syllabus && isConfirmed && (
                      <td className="p-3 hidden md:table-cell">
                        {groupName ? (
                          <span className="text-[11px] text-[#525252] bg-[#161616] border border-[#1F1F1F] rounded px-1.5 py-0.5">
                            {groupName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#525252]">--</span>
                        )}
                      </td>
                    )}
                    <td className="p-3 text-[#A3A3A3] text-sm hidden sm:table-cell">
                      {formatDate(a.dueDate)}
                    </td>
                    <td className="p-3 text-right">
                      {(() => {
                        const val = editedScores[a.id] ?? ''
                        const numVal = parseFloat(val)
                        const exceedsMax = !isNaN(numVal) && a.pointsPossible != null && numVal > a.pointsPossible
                        const effectiveScore = val !== '' ? numVal : null
                        const zScore = isExamRow && examStat && effectiveScore !== null && !isNaN(effectiveScore)
                          ? computeZScore(effectiveScore, examStat.mean, examStat.stdDev)
                          : null
                        return (
                          <div className="flex items-center justify-end gap-1">
                            {zScore !== null && (
                              <span className={`text-[11px] mr-0.5 whitespace-nowrap ${
                                zScore >= 0 ? 'text-emerald-500' : 'text-red-400'
                              }`}>
                                {formatZScore(zScore)}
                              </span>
                            )}
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) =>
                                handleScoreChange(a.id, e.target.value)
                              }
                              placeholder="—"
                              className={`w-16 bg-[#161616] border rounded px-2 py-1 text-sm text-right focus:outline-none placeholder-[#525252] ${
                                exceedsMax
                                  ? 'border-amber-500/50 text-amber-400'
                                  : 'border-[#1F1F1F] text-[#F5F5F5] focus:border-[#333]'
                              }`}
                            />
                          </div>
                        )
                      })()}
                    </td>
                    <td className={`p-3 text-center text-sm ${maxIsOverridden ? 'text-amber-400' : 'text-[#A3A3A3]'}`}>
                      {effectiveMax != null ? effectiveMax : '--'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${getStatusClasses(a.status)}`}
                        >
                          {a.status}
                        </span>
                        {isExcluded && (
                          <span className="text-[10px] text-amber-500/70 bg-amber-500/10 rounded px-1 py-0.5">
                            excluded
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
