'use client'

import { useState } from 'react'
import { Plus, Trash2, Save } from 'lucide-react'

interface ComponentGroupInput {
  tempId: string
  name: string
  weight: string
  dropLowest: string
  isExam: boolean
  isBestOf: boolean
}

interface ClobberInput {
  tempId: string
  sourceName: string
  targetName: string
  comparisonType: 'raw' | 'zscore'
  conditionText: string
}

interface ExistingGroup {
  name: string
  weight: number // 0-1 decimal
  dropLowest: number
  isExam: boolean
  isBestOf: boolean
}

interface ExistingClobber {
  sourceName: string
  targetName: string
  comparisonType: 'raw' | 'zscore'
  conditionText: string
}

interface Props {
  courseCode: string
  courseId: string
  existingSyllabusId?: string
  existingGroups?: ExistingGroup[]
  existingClobberPolicies?: ExistingClobber[]
  existingIsCurved?: boolean
  existingCurveDescription?: string | null
  onSaved: () => void
  onDismiss: () => void
}

const DEFAULT_GROUPS: ComponentGroupInput[] = [
  { tempId: '1', name: 'Homework', weight: '40', dropLowest: '0', isExam: false, isBestOf: false },
  { tempId: '2', name: 'Midterm', weight: '30', dropLowest: '0', isExam: true, isBestOf: false },
  { tempId: '3', name: 'Final', weight: '30', dropLowest: '0', isExam: true, isBestOf: false },
]

export default function SyllabusManualEntry({
  courseCode,
  courseId,
  existingSyllabusId,
  existingGroups,
  existingClobberPolicies,
  existingIsCurved,
  existingCurveDescription,
  onSaved,
  onDismiss,
}: Props) {
  const [groups, setGroups] = useState<ComponentGroupInput[]>(() => {
    if (existingGroups?.length) {
      return existingGroups.map((g, i) => ({
        tempId: String(i),
        name: g.name,
        weight: String(Math.round(g.weight * 100)),
        dropLowest: String(g.dropLowest),
        isExam: g.isExam,
        isBestOf: g.isBestOf,
      }))
    }
    return DEFAULT_GROUPS
  })
  const [isCurved, setIsCurved] = useState(existingIsCurved ?? false)
  const [curveDescription, setCurveDescription] = useState(existingCurveDescription ?? '')
  const [clobberPolicies, setClobberPolicies] = useState<ClobberInput[]>(() => {
    if (existingClobberPolicies?.length) {
      return existingClobberPolicies.map((p, i) => ({
        tempId: String(i),
        sourceName: p.sourceName,
        targetName: p.targetName,
        comparisonType: p.comparisonType,
        conditionText: p.conditionText,
      }))
    }
    return []
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalWeight = groups.reduce((s, g) => {
    const w = parseFloat(g.weight)
    return s + (isNaN(w) ? 0 : w)
  }, 0)
  const weightsValid = Math.abs(totalWeight - 100) < 1

  function addGroup() {
    setGroups(g => [...g, {
      tempId: Date.now().toString(),
      name: '',
      weight: '',
      dropLowest: '0',
      isExam: false,
      isBestOf: false,
    }])
  }

  function updateGroup(tempId: string, field: keyof ComponentGroupInput, value: string | boolean) {
    setGroups(g => g.map(group => {
      if (group.tempId !== tempId) return group
      const updated = { ...group, [field]: value }
      // Auto-check isExam when name contains exam keywords
      if (field === 'name' && typeof value === 'string') {
        const lower = value.toLowerCase()
        const isExamName = /\b(exam|midterm|final|mt\d|quiz)\b/.test(lower)
        updated.isExam = isExamName
      }
      return updated
    }))
  }

  function removeGroup(tempId: string) {
    setGroups(g => g.filter(group => group.tempId !== tempId))
  }

  function addClobber() {
    setClobberPolicies(p => [...p, {
      tempId: Date.now().toString(),
      sourceName: '',
      targetName: '',
      comparisonType: 'raw',
      conditionText: '',
    }])
  }

  async function handleSave() {
    if (!weightsValid) {
      setError(`Weights sum to ${totalWeight.toFixed(0)}% — must equal 100%`)
      return
    }
    const invalidGroups = groups.filter(g => !g.name.trim() || isNaN(parseFloat(g.weight)))
    if (invalidGroups.length > 0) {
      setError('All components need a name and weight')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/syllabus/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          existingSyllabusId,
          isCurved,
          curveDescription: isCurved ? curveDescription : null,
          componentGroups: groups.map(g => ({
            name: g.name.trim(),
            weight: parseFloat(g.weight) / 100,
            dropLowest: parseInt(g.dropLowest) || 0,
            isExam: g.isExam,
            isBestOf: g.isBestOf,
          })),
          clobberPolicies: clobberPolicies
            .filter(p => p.sourceName && p.targetName)
            .map(p => ({
              sourceName: p.sourceName,
              targetName: p.targetName,
              comparisonType: p.comparisonType,
              conditionText: p.conditionText || `${p.sourceName} replaces ${p.targetName} if higher`,
            })),
        }),
      })

      if (!res.ok) throw new Error('Save failed')
      onSaved()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-[#1F1F1F]">
          <h2 className="text-sm font-medium text-[#F5F5F5]">
            Grade Weights &mdash; {courseCode}
          </h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Enter your grade breakdown from the syllabus
          </p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-4 space-y-5 flex-1">

          {/* Curved toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[#F5F5F5]">Curved class</p>
              <p className="text-[11px] text-[#525252]">
                Exam scores determine grade relative to class performance
              </p>
            </div>
            <button
              role="switch"
              aria-checked={isCurved}
              onClick={() => setIsCurved(v => !v)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors shrink-0 ${
                isCurved ? 'bg-blue-600' : 'bg-[#333]'
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                isCurved ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {isCurved && (
            <>
              <input
                type="text"
                value={curveDescription}
                onChange={e => setCurveDescription(e.target.value)}
                placeholder="e.g. curved to B+ median (optional)"
                className="w-full bg-[#161616] border border-[#1F1F1F] rounded px-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
              />
              <div className="flex items-start gap-2 bg-[#161616] border border-amber-500/20 rounded p-3">
                <span className="text-amber-500 text-xs mt-0.5">{'\u26A0'}</span>
                <div>
                  <p className="text-xs text-[#F5F5F5]">This is a curved course</p>
                  <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                    Create one component per exam (e.g. &ldquo;Midterm 1&rdquo; at 12%, &ldquo;Midterm 2&rdquo; at 12%).
                    Do not combine exams into a single group &mdash; each exam needs its own weight
                    for accurate grade projection.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Component groups */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#525252] uppercase tracking-wide">
                Grade Components
              </p>
              <span className={`text-xs ${weightsValid ? 'text-emerald-500' : 'text-amber-500'}`}>
                {totalWeight.toFixed(0)}% / 100%
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-1.5 mb-1.5 px-1">
              <span className="col-span-4 text-[10px] text-[#525252]">Component</span>
              <span className="col-span-2 text-[10px] text-[#525252] text-center">Weight %</span>
              <span className="col-span-2 text-[10px] text-[#525252] text-center">Drop</span>
              <span className="col-span-2 text-[10px] text-[#525252] text-center">Exam</span>
              <span className="col-span-2 text-[10px] text-[#525252]"></span>
            </div>

            <div className="space-y-1.5">
              {groups.map(group => (
                <div key={group.tempId} className="grid grid-cols-12 gap-1.5 items-center">
                  <input
                    type="text"
                    value={group.name}
                    onChange={e => updateGroup(group.tempId, 'name', e.target.value)}
                    placeholder="Homework"
                    className="col-span-4 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
                  />
                  <input
                    type="number"
                    value={group.weight}
                    onChange={e => updateGroup(group.tempId, 'weight', e.target.value)}
                    placeholder="40"
                    className="col-span-2 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] text-center placeholder-[#525252]"
                  />
                  <input
                    type="number"
                    value={group.dropLowest}
                    onChange={e => updateGroup(group.tempId, 'dropLowest', e.target.value)}
                    min="0"
                    className="col-span-2 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] text-center"
                  />
                  <div className="col-span-2 flex justify-center">
                    <button
                      onClick={() => updateGroup(group.tempId, 'isExam', !group.isExam)}
                      className={`w-5 h-5 rounded border transition-colors ${
                        group.isExam
                          ? 'bg-amber-500/20 border-amber-500/50'
                          : 'bg-[#161616] border-[#1F1F1F]'
                      }`}
                    >
                      {group.isExam && (
                        <span className="text-amber-500 text-[10px] leading-none">&#10003;</span>
                      )}
                    </button>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => removeGroup(group.tempId)}
                      className="text-[#525252] hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addGroup}
              className="mt-2 flex items-center gap-1 text-xs text-[#525252] hover:text-[#A3A3A3] transition-colors"
            >
              <Plus size={12} />
              Add component
            </button>
          </div>

          {/* Clobber policies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#525252] uppercase tracking-wide">
                Score Replacement (optional)
              </p>
              <button
                onClick={addClobber}
                className="text-xs text-[#525252] hover:text-[#A3A3A3] flex items-center gap-1"
              >
                <Plus size={11} /> Add
              </button>
            </div>
            {clobberPolicies.length === 0 && (
              <p className="text-[11px] text-[#525252]">
                e.g. &ldquo;Final replaces Midterm if higher&rdquo;
              </p>
            )}
            {clobberPolicies.map(policy => (
              <div key={policy.tempId} className="grid grid-cols-12 gap-1.5 items-center mb-1.5">
                <input
                  type="text"
                  value={policy.sourceName}
                  onChange={e => setClobberPolicies(p => p.map(cp =>
                    cp.tempId === policy.tempId ? { ...cp, sourceName: e.target.value } : cp
                  ))}
                  placeholder="Final"
                  className="col-span-4 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
                />
                <span className="col-span-1 text-[10px] text-[#525252] text-center">&rarr;</span>
                <input
                  type="text"
                  value={policy.targetName}
                  onChange={e => setClobberPolicies(p => p.map(cp =>
                    cp.tempId === policy.tempId ? { ...cp, targetName: e.target.value } : cp
                  ))}
                  placeholder="Midterm"
                  className="col-span-4 bg-[#161616] border border-[#1F1F1F] rounded px-2 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252]"
                />
                <select
                  value={policy.comparisonType}
                  onChange={e => setClobberPolicies(p => p.map(cp =>
                    cp.tempId === policy.tempId
                      ? { ...cp, comparisonType: e.target.value as 'raw' | 'zscore' }
                      : cp
                  ))}
                  className="col-span-2 bg-[#161616] border border-[#1F1F1F] rounded px-1 py-1.5 text-[10px] text-[#F5F5F5]"
                >
                  <option value="raw">raw</option>
                  <option value="zscore">z-score</option>
                </select>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={() => setClobberPolicies(p => p.filter(cp => cp.tempId !== policy.tempId))}
                    className="text-[#525252] hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1F1F1F] flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !weightsValid}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded px-3 py-1.5 transition-colors"
          >
            <Save size={13} />
            {saving ? 'Saving...' : 'Save grade weights'}
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-[#525252] hover:text-[#A3A3A3]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
