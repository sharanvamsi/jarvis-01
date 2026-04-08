'use client'

import { useState, useMemo, useEffect } from 'react'
import GradeDistributionBar from '@/components/grades/GradeDistributionBar'

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
  snapshots: BTSnapshot[]
  markerLetter?: string | null
  onSnapshotChange?: (snapshot: BTSnapshot | null) => void
}

function hasDistribution(s: BTSnapshot): boolean {
  return Array.isArray(s.distribution) &&
    s.distribution.some((d) => d.count > 0)
}

export default function BTHistoricalSection({ snapshots, markerLetter, onSnapshotChange }: Props) {
  // Pre-filter: only keep snapshots that have actual distribution data
  const validSnapshots = useMemo(
    () => snapshots.filter(hasDistribution),
    [snapshots]
  )

  // Build unique instructor names from valid snapshots only
  const instructorOptions = useMemo(() => {
    const names = new Set<string>()
    for (const s of validSnapshots) {
      if (s.instructor) names.add(s.instructor)
    }
    return Array.from(names).sort()
  }, [validSnapshots])

  const [selectedInstructor, setSelectedInstructor] = useState('__all__')
  const [showPnp, setShowPnp] = useState(false)

  // Filter snapshots by selected instructor
  const filteredSnapshots = useMemo(() => {
    if (selectedInstructor === '__all__') {
      return validSnapshots.filter((s) => s.instructor === null)
    }
    return validSnapshots.filter((s) => s.instructor === selectedInstructor)
  }, [validSnapshots, selectedInstructor])

  // Build semester dropdown options from filtered snapshots
  const semesterOptions = useMemo(() => {
    const options: { label: string; value: string }[] = []

    // All Time (year=0)
    const allTime = filteredSnapshots.find((s) => s.year === 0 && s.semester === 'All')
    if (allTime) {
      options.push({ label: 'All Time', value: '0-All' })
    }

    // Semester snapshots sorted by year desc, then Fall before Spring
    const semesterOrder: Record<string, number> = { Fall: 0, Spring: 1, Summer: 2 }
    const semesterSnaps = filteredSnapshots
      .filter((s) => s.year > 0)
      .sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year
        return (semesterOrder[a.semester] ?? 3) - (semesterOrder[b.semester] ?? 3)
      })

    for (const s of semesterSnaps) {
      const key = `${s.year}-${s.semester}`
      if (!options.find((o) => o.value === key)) {
        options.push({ label: `${s.semester} ${s.year}`, value: key })
      }
    }

    return options
  }, [filteredSnapshots])

  const [selectedSemester, setSelectedSemester] = useState(
    semesterOptions[0]?.value ?? ''
  )

  // Reset semester selection when instructor changes and current selection is invalid
  const effectiveSemester = semesterOptions.find((o) => o.value === selectedSemester)
    ? selectedSemester
    : semesterOptions[0]?.value ?? ''

  const selectedSnapshot = useMemo(() => {
    if (!effectiveSemester) return null
    const [yearStr, sem] = effectiveSemester.split('-')
    const year = parseInt(yearStr, 10)
    return filteredSnapshots.find(
      (s) => s.year === year && s.semester === sem
    ) ?? null
  }, [filteredSnapshots, effectiveSemester])

  // Notify parent when selected snapshot changes
  useEffect(() => {
    onSnapshotChange?.(selectedSnapshot)
  }, [selectedSnapshot, onSnapshotChange])

  // Count unique semesters with data (excluding all-time) for the current instructor view
  const semesterCount = filteredSnapshots.filter((s) => s.year > 0).length

  if (validSnapshots.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-[#F5F5F5] mb-3">
          Historical Grade Distribution
        </h3>
        <p className="text-[#525252] text-sm text-center py-8">
          No historical data available for this course
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[#F5F5F5]">
            Historical Grade Distribution
          </h3>
          <span className="text-[10px] text-[#525252] bg-[#161616] border border-[#1F1F1F] rounded px-1.5 py-0.5">
            via Berkeleytime
          </span>
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Semester dropdown */}
          <select
            value={effectiveSemester}
            onChange={(e) => {
              setSelectedSemester(e.target.value)
              setShowPnp(false)
            }}
            className="bg-[#111111] border border-[#1F1F1F] rounded-md px-3 py-1.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#333] cursor-pointer"
          >
            {semesterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Instructor dropdown — only show if there are instructor-specific snapshots */}
          {instructorOptions.length > 0 && (
            <select
              value={selectedInstructor}
              onChange={(e) => {
                setSelectedInstructor(e.target.value)
                setSelectedSemester('')
                setShowPnp(false)
              }}
              className="bg-[#111111] border border-[#1F1F1F] rounded-md px-3 py-1.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#333] cursor-pointer"
            >
              <option value="__all__">All Instructors</option>
              {instructorOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}

          {/* Show P/NP toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="text-xs text-[#A3A3A3]">Show P/NP</span>
            <button
              role="switch"
              aria-checked={showPnp}
              onClick={() => setShowPnp(v => !v)}
              className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
                showPnp ? "bg-blue-500" : "bg-[#333]"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform mt-0.5 ${
                  showPnp ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Chart */}
      {selectedSnapshot ? (
        <GradeDistributionBar
          distribution={selectedSnapshot.distribution}
          average={selectedSnapshot.average}
          showPnp={showPnp}
          markerLetter={markerLetter}
        />
      ) : (
        <p className="text-[#525252] text-sm text-center py-6">
          No data for this combination
        </p>
      )}

      {/* Stat pills */}
      <div className="flex flex-wrap gap-2 mt-4">
        {selectedSnapshot?.average != null && (
          <span className="bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#A3A3A3]">
            avg GPA: <span className="text-[#F5F5F5]">{selectedSnapshot.average.toFixed(2)}</span>
          </span>
        )}
        {selectedSnapshot?.pnpPercentage != null && selectedSnapshot.pnpPercentage > 0 && (
          <span className="bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#A3A3A3]">
            <span className="text-[#F5F5F5]">{(selectedSnapshot.pnpPercentage * 100).toFixed(1)}%</span> took P/NP
          </span>
        )}
        <span className="bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#A3A3A3]">
          <span className="text-[#F5F5F5]">{semesterCount}</span> semesters of data
        </span>
        {selectedInstructor !== '__all__' && (
          <span className="bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1 text-xs text-[#A3A3A3]">
            {selectedInstructor} only
          </span>
        )}
      </div>
    </div>
  )
}
