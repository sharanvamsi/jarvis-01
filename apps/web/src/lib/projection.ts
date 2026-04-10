// ── Grade Projection Engine ──────────────────────────────────

export interface BTDistributionItem {
  letter: string
  percentage: number
  count: number
}

// Standard Berkeley grade scale (fallback)
const STANDARD_SCALE = [
  { letter: 'A+', min: 97, max: 100 },
  { letter: 'A', min: 93, max: 97 },
  { letter: 'A-', min: 90, max: 93 },
  { letter: 'B+', min: 87, max: 90 },
  { letter: 'B', min: 83, max: 87 },
  { letter: 'B-', min: 80, max: 83 },
  { letter: 'C+', min: 77, max: 80 },
  { letter: 'C', min: 73, max: 77 },
  { letter: 'C-', min: 70, max: 73 },
  { letter: 'D+', min: 67, max: 70 },
  { letter: 'D', min: 63, max: 67 },
  { letter: 'D-', min: 60, max: 63 },
  { letter: 'F', min: 0, max: 60 },
]

export type AssignmentStatus = 'graded' | 'missing' | 'submitted' | 'ungraded'

export interface ProjectionAssignment {
  id: string
  name: string
  score: number | null
  maxScore: number | null
  status: AssignmentStatus
  assignmentType: string
  hypotheticalScore: number | null // from sandbox edits
  examStat?: { mean: number; stdDev: number } | null
  // Override fields
  excludeFromCalc: boolean       // if true, skip this assignment entirely
  overrideMaxScore: number | null // use instead of maxScore if set
  overrideGroupId: string | null  // user reassigned to different group
}

export interface ProjectionGroup {
  id: string
  name: string
  weight: number
  dropLowest: number
  isBestOf: boolean
  isExam: boolean
  assignments: ProjectionAssignment[]
}

export interface ClobberPolicy {
  sourceName: string
  targetName: string
  comparisonType: 'raw' | 'zscore'
  sourceGroup?: { id: string; name: string } | null
  targetGroup?: { id: string; name: string } | null
}

export interface GradeScaleEntry {
  letter: string
  minScore: number
  maxScore: number
  isPoints: boolean
}

export interface ProjectionInput {
  isCurved: boolean
  isPointsBased: boolean
  totalPoints: number | null
  groups: ProjectionGroup[]
  clobberPolicies: ClobberPolicy[]
  gradeScale: GradeScaleEntry[] | null
  btDistribution: BTDistributionItem[] | null
}

export interface ExamAssignmentBreakdown {
  name: string
  score: number | null
  mean: number | null
  stdDev: number | null
  zScore: number | null
}

export interface GroupBreakdown {
  groupId: string
  groupName: string
  weight: number
  score: number | null      // percentage (0-100) for weighted, z-score for curved
  isExam: boolean
  dropped: string[]         // names of dropped assignments
  assignmentCount: number   // total assignments in group
  gradedCount: number       // assignments with scores
  hasHypothetical: boolean  // any sandbox edits in this group
  clobbered: boolean        // score was replaced by clobber policy
  examZScore: number | null // z-score for exam groups in curved mode
  examMean: number | null   // exam mean for display
  examStdDev: number | null // exam std dev for display
  examAssignments: ExamAssignmentBreakdown[] // per-assignment z-scores for curved
}

export interface ProjectionResult {
  projectedLetter: string | null
  projectedPct: number | null
  projectedZScore: number | null
  projectedPercentile: number | null
  confidence: 'high' | 'medium' | 'low'
  pendingExams: string[]
  method: 'weighted' | 'curved'
  disclaimer: string | null
  breakdown: GroupBreakdown[]
}

// Normal CDF approximation (Abramowitz and Stegun)
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.3193815 +
      t *
        (-0.3565638 +
          t * (1.7814779 + t * (-1.821256 + t * 1.3302744))))
  const result = z > 0 ? 1 - p : p
  return Math.max(0.0001, Math.min(0.9999, result))
}

function getEffectiveScore(a: ProjectionAssignment): number | null {
  if (a.excludeFromCalc) return null
  if (a.hypotheticalScore !== null) return a.hypotheticalScore
  if (a.status === 'missing') return 0
  if (a.status === 'graded' && a.score !== null) return a.score
  return null
}

function getEffectiveMaxScore(a: ProjectionAssignment): number | null {
  if (a.excludeFromCalc) return null
  return a.overrideMaxScore ?? a.maxScore
}

function letterFromPct(
  pct: number,
  scale: GradeScaleEntry[] | null
): string {
  const scaleToUse = scale?.length
    ? [...scale].sort((a, b) => b.minScore - a.minScore)
    : STANDARD_SCALE.map((s) => ({
        letter: s.letter,
        minScore: s.min,
        maxScore: s.max,
        isPoints: false,
      }))
  for (const entry of scaleToUse) {
    if (pct >= entry.minScore) return entry.letter
  }
  return 'F'
}

// Map a percentile (0-1) to a letter grade using BT distribution
function letterFromPercentile(
  percentile: number,
  distribution: BTDistributionItem[]
): string {
  const PNP = new Set(['P', 'NP', 'S', 'U'])
  const letterOnly = distribution.filter((d) => !PNP.has(d.letter))
  const total = letterOnly.reduce((s, d) => s + d.count, 0)
  if (total === 0) return 'F'

  const ORDER = [
    'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-',
    'D+', 'D', 'D-', 'F',
  ]
  const sorted = [...letterOnly].sort(
    (a, b) => ORDER.indexOf(a.letter) - ORDER.indexOf(b.letter)
  )

  // Cumulative from top — find which bucket the percentile falls in
  let cumulative = 0
  for (const bucket of sorted) {
    cumulative += bucket.count / total
    if (1 - percentile <= cumulative) return bucket.letter
  }
  return 'F'
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  if (input.isCurved) {
    return computeCurvedProjection(input)
  }
  return computeWeightedProjection(input)
}

function computeWeightedProjection(
  input: ProjectionInput
): ProjectionResult {
  const { groups, clobberPolicies, gradeScale } = input

  let totalWeightUsed = 0
  let weightedSum = 0
  const pendingExams: string[] = []
  const groupScores = new Map<string, number | null>()
  const breakdown: GroupBreakdown[] = []

  for (const group of groups) {
    const withScores = group.assignments
      .map((a) => ({
        a,
        effective: getEffectiveScore(a),
        max: getEffectiveMaxScore(a) ?? 100,
      }))
      .filter(
        (x): x is { a: ProjectionAssignment; effective: number; max: number } =>
          x.effective !== null
      )

    const gradedCount = withScores.length
    const hasHypothetical = group.assignments.some(a => a.hypotheticalScore !== null)

    if (withScores.length === 0) {
      groupScores.set(group.id, null)
      if (group.isExam) pendingExams.push(group.name)
      breakdown.push({
        groupId: group.id,
        groupName: group.name,
        weight: group.weight,
        score: null,
        isExam: group.isExam,
        dropped: [],
        assignmentCount: group.assignments.length,
        gradedCount: 0,
        hasHypothetical,
        clobbered: false,
        examZScore: null,
        examMean: null,
        examStdDev: null,
        examAssignments: [],
      })
      continue
    }

    let scored = [...withScores]
    const droppedNames: string[] = []

    // Apply dropLowest
    if (group.dropLowest > 0 && scored.length > group.dropLowest) {
      scored = scored
        .sort((a, b) => a.effective / a.max - b.effective / b.max)
      const dropped = scored.slice(0, group.dropLowest)
      droppedNames.push(...dropped.map(d => d.a.name))
      scored = scored.slice(group.dropLowest)
    }

    // Apply isBestOf
    if (group.isBestOf && scored.length > 1) {
      scored = [
        scored.reduce((best, x) =>
          x.effective / x.max > best.effective / best.max ? x : best
        ),
      ]
    }

    const numerator = scored.reduce((s, x) => s + x.effective, 0)
    const denominator = scored.reduce((s, x) => s + x.max, 0)
    const score = denominator > 0 ? (numerator / denominator) * 100 : null
    groupScores.set(group.id, score)

    breakdown.push({
      groupId: group.id,
      groupName: group.name,
      weight: group.weight,
      score,
      isExam: group.isExam,
      dropped: droppedNames,
      assignmentCount: group.assignments.length,
      gradedCount,
      hasHypothetical,
      clobbered: false,
      examZScore: null,
      examMean: null,
      examStdDev: null,
      examAssignments: [],
    })
  }

  // Apply clobber policies (FK-preferred with name fallback)
  for (const policy of clobberPolicies) {
    const sourceGroupName = policy.sourceGroup?.name ?? policy.sourceName
    const targetGroupName = policy.targetGroup?.name ?? policy.targetName
    const sourceGroup = groups.find((g) =>
      g.name.toLowerCase().includes(sourceGroupName.toLowerCase())
    )
    const targetGroup = groups.find((g) =>
      g.name.toLowerCase().includes(targetGroupName.toLowerCase())
    )
    if (!sourceGroup || !targetGroup) continue

    const sourceScore = groupScores.get(sourceGroup.id)
    const targetScore = groupScores.get(targetGroup.id)
    if (
      sourceScore !== null &&
      sourceScore !== undefined &&
      targetScore !== null &&
      targetScore !== undefined &&
      sourceScore > targetScore
    ) {
      groupScores.set(targetGroup.id, sourceScore)
      // Mark the target group as clobbered in breakdown
      const bd = breakdown.find(b => b.groupId === targetGroup.id)
      if (bd) {
        bd.clobbered = true
        bd.score = sourceScore
      }
    }
  }

  // Compute weighted sum
  for (const group of groups) {
    const score = groupScores.get(group.id)
    if (score === null || score === undefined) continue
    if (input.isPointsBased) {
      // Points-based: group.weight = max points for this group
      // score = percentage within the group (0-100)
      // Earned points = (score / 100) * group.weight
      weightedSum += (score / 100) * group.weight
    } else {
      weightedSum += score * group.weight
    }
    totalWeightUsed += group.weight
  }

  if (totalWeightUsed === 0) {
    return {
      projectedLetter: null,
      projectedPct: null,
      projectedZScore: null,
      projectedPercentile: null,
      confidence: 'low',
      pendingExams,
      method: 'weighted',
      disclaimer: null,
      breakdown,
    }
  }

  if (input.isPointsBased && input.totalPoints) {
    // Points-based: project total points earned, then map to letter
    const projectedPoints = (weightedSum / totalWeightUsed) * input.totalPoints
    const projectedPct = Math.round((projectedPoints / input.totalPoints) * 1000) / 10
    const confidence: 'high' | 'medium' | 'low' =
      totalWeightUsed / input.totalPoints >= 0.9 ? 'high'
        : totalWeightUsed / input.totalPoints >= 0.5 ? 'medium'
        : 'low'

    return {
      projectedLetter: letterFromPct(projectedPoints, gradeScale),
      projectedPct,
      projectedZScore: null,
      projectedPercentile: null,
      confidence,
      pendingExams,
      method: 'weighted',
      disclaimer: null,
      breakdown,
    }
  }

  // Percentage-based: normalize to get overall percentage
  const normalizedPct = weightedSum / totalWeightUsed
  const confidence: 'high' | 'medium' | 'low' =
    totalWeightUsed >= 0.9 ? 'high' : totalWeightUsed >= 0.5 ? 'medium' : 'low'

  return {
    projectedLetter: letterFromPct(normalizedPct, gradeScale),
    projectedPct: Math.round(normalizedPct * 10) / 10,
    projectedZScore: null,
    projectedPercentile: null,
    confidence,
    pendingExams,
    method: 'weighted',
    disclaimer: null,
    breakdown,
  }
}

function computeCurvedProjection(
  input: ProjectionInput
): ProjectionResult {
  const { groups, clobberPolicies, btDistribution } = input
  const pendingExams: string[] = []

  if (!btDistribution) {
    return {
      projectedLetter: null,
      projectedPct: null,
      projectedZScore: null,
      projectedPercentile: null,
      confidence: 'low',
      pendingExams,
      method: 'curved',
      disclaimer: 'No historical distribution selected',
      breakdown: [],
    }
  }

  const examGroups = groups.filter((g) => g.isExam)
  let totalExamWeight = examGroups.reduce((s, g) => s + g.weight, 0)
  if (totalExamWeight === 0) totalExamWeight = 1

  let weightedZScore = 0
  let totalWeightUsed = 0
  const examZScores = new Map<string, number | null>()

  for (const group of examGroups) {
    // Get all assignments in this group that have stats and scores
    const gradedExams = group.assignments
      .filter(a => a.examStat != null && !a.excludeFromCalc)
      .map(a => {
        const score = getEffectiveScore(a)
        if (score === null || !a.examStat || a.examStat.stdDev === 0) return null
        const z = (score - a.examStat.mean) / a.examStat.stdDev
        const maxPts = getEffectiveMaxScore(a) ?? 100
        return { z, maxPts, name: a.name, mean: a.examStat.mean, stdDev: a.examStat.stdDev }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (gradedExams.length === 0) {
      // Check if any exam in this group exists but just has no stats yet
      const hasUngradedExams = group.assignments.some(
        a => !a.excludeFromCalc && a.examStat == null
      )
      if (hasUngradedExams || group.assignments.length === 0) {
        pendingExams.push(group.name)
      }
      examZScores.set(group.id, null)
      continue
    }

    // If multiple exams in one group, weight by points possible
    // Single exam: just use its z-score directly
    let groupZ: number
    if (gradedExams.length === 1) {
      groupZ = gradedExams[0].z
    } else {
      const totalPts = gradedExams.reduce((s, e) => s + e.maxPts, 0)
      groupZ = totalPts > 0
        ? gradedExams.reduce((s, e) => s + e.z * (e.maxPts / totalPts), 0)
        : gradedExams.reduce((s, e) => s + e.z, 0) / gradedExams.length
    }

    examZScores.set(group.id, groupZ)
  }

  // Apply clobber policies (FK-preferred with name fallback)
  for (const policy of clobberPolicies) {
    if (policy.comparisonType !== 'zscore') continue
    const sourceGroupName = policy.sourceGroup?.name ?? policy.sourceName
    const targetGroupName = policy.targetGroup?.name ?? policy.targetName
    const sourceGroup = examGroups.find((g) =>
      g.name.toLowerCase().includes(sourceGroupName.toLowerCase())
    )
    const targetGroup = examGroups.find((g) =>
      g.name.toLowerCase().includes(targetGroupName.toLowerCase())
    )
    if (!sourceGroup || !targetGroup) continue

    const sourceZ = examZScores.get(sourceGroup.id)
    const targetZ = examZScores.get(targetGroup.id)
    if (
      sourceZ !== null &&
      sourceZ !== undefined &&
      targetZ !== null &&
      targetZ !== undefined &&
      sourceZ > targetZ
    ) {
      examZScores.set(targetGroup.id, sourceZ)
    }
  }

  for (const group of examGroups) {
    const z = examZScores.get(group.id)
    if (z === null || z === undefined) continue
    const normalizedWeight = group.weight / totalExamWeight
    weightedZScore += z * normalizedWeight
    totalWeightUsed += normalizedWeight
  }

  // Build breakdown for curved projection
  const curvedBreakdown: GroupBreakdown[] = groups.map((group) => {
    const z = examZScores.get(group.id)
    // Find first exam stat for summary display
    const firstStatAssignment = group.assignments.find(a => a.examStat != null)
    const stat = firstStatAssignment?.examStat ?? null

    // Build per-assignment detail for exam groups
    const examAssignmentDetails: ExamAssignmentBreakdown[] = group.isExam
      ? group.assignments.map(a => {
          const score = getEffectiveScore(a)
          const aZ = (score !== null && a.examStat && a.examStat.stdDev > 0)
            ? (score - a.examStat.mean) / a.examStat.stdDev
            : null
          return {
            name: a.name,
            score,
            mean: a.examStat?.mean ?? null,
            stdDev: a.examStat?.stdDev ?? null,
            zScore: aZ !== null ? Math.round(aZ * 100) / 100 : null,
          }
        })
      : []

    return {
      groupId: group.id,
      groupName: group.name,
      weight: group.weight,
      score: z !== null && z !== undefined ? Math.round(z * 100) / 100 : null,
      isExam: group.isExam,
      dropped: [],
      assignmentCount: group.assignments.length,
      gradedCount: group.assignments.filter(a => getEffectiveScore(a) !== null).length,
      hasHypothetical: group.assignments.some(a => a.hypotheticalScore !== null),
      clobbered: false,
      examZScore: z !== null && z !== undefined ? Math.round(z * 100) / 100 : null,
      examMean: stat?.mean ?? null,
      examStdDev: stat?.stdDev ?? null,
      examAssignments: examAssignmentDetails,
    }
  })

  if (totalWeightUsed === 0) {
    return {
      projectedLetter: null,
      projectedPct: null,
      projectedZScore: null,
      projectedPercentile: null,
      confidence: 'low',
      pendingExams,
      method: 'curved',
      disclaimer:
        'No exam statistics available yet. Enter mean and std dev from Ed.',
      breakdown: curvedBreakdown,
    }
  }

  const finalZ = weightedZScore / totalWeightUsed
  const percentile = normalCDF(finalZ)
  const projectedLetter = letterFromPercentile(percentile, btDistribution)

  const confidence: 'high' | 'medium' | 'low' =
    pendingExams.length === 0
      ? 'high'
      : pendingExams.length <= 1
        ? 'medium'
        : 'low'

  return {
    projectedLetter,
    projectedPct: null,
    projectedZScore: Math.round(finalZ * 100) / 100,
    projectedPercentile: Math.round(percentile * 1000) / 10,
    confidence,
    pendingExams,
    method: 'curved',
    disclaimer:
      'Estimated based on your exam performance vs your chosen historical distribution',
    breakdown: curvedBreakdown,
  }
}
