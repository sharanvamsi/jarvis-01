'use client'

import { useState } from 'react'
import { X, CheckCircle, AlertCircle } from 'lucide-react'

interface ComponentGroupUI {
  id: string
  name: string
  weight: number
  dropLowest: number
  isExam: boolean
  assignmentCount: number
}

interface Props {
  courseCode: string
  syllabusId: string
  isCurved: boolean
  curveDescription: string | null
  componentGroups: ComponentGroupUI[]
  clobberPolicies: {
    sourceName: string
    targetName: string
    conditionText: string
  }[]
  onConfirm: () => void
  onDismiss: () => void
}

export default function SyllabusConfirmation({
  courseCode,
  syllabusId,
  isCurved,
  curveDescription,
  componentGroups,
  clobberPolicies,
  onConfirm,
  onDismiss,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const totalWeight = componentGroups.reduce((s, g) => s + g.weight, 0)
  const weightsValid = Math.abs(totalWeight - 1.0) < 0.02

  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirming(true)
    setError(null)
    try {
      const res = await fetch('/api/syllabus/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabusId }),
      })
      if (!res.ok) {
        setError('Failed to confirm. Please try again.')
        return
      }
      onConfirm()
    } catch {
      setError('Failed to confirm. Please try again.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1F1F1F]">
          <div>
            <h2 className="text-sm font-medium text-[#F5F5F5]">
              Grade Weights Found &mdash; {courseCode}
            </h2>
            <p className="text-xs text-[#525252] mt-0.5">
              Review and confirm these match your syllabus
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-[#525252] hover:text-[#A3A3A3]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Curved flag */}
          {isCurved && (
            <div className="flex items-start gap-2 bg-[#161616] border border-[#1F1F1F] rounded p-3">
              <AlertCircle
                size={14}
                className="text-amber-500 mt-0.5 shrink-0"
              />
              <div>
                <p className="text-xs text-[#F5F5F5] font-medium">
                  Curved class detected
                </p>
                {curveDescription && (
                  <p className="text-xs text-[#A3A3A3] mt-0.5">
                    {curveDescription}
                  </p>
                )}
                <p className="text-xs text-[#525252] mt-1">
                  Grade projection will use exam performance vs historical
                  distributions.
                </p>
              </div>
            </div>
          )}

          {/* Component groups */}
          <div>
            <p className="text-xs text-[#525252] uppercase tracking-wide mb-2">
              Grade Components
            </p>
            <div className="space-y-1.5">
              {componentGroups.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between bg-[#161616] border border-[#1F1F1F] rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#F5F5F5]">{g.name}</span>
                    {g.dropLowest > 0 && (
                      <span className="text-[10px] text-[#525252] bg-[#1F1F1F] rounded px-1.5 py-0.5">
                        drop {g.dropLowest}
                      </span>
                    )}
                    {g.isExam && (
                      <span className="text-[10px] text-amber-500/70 bg-amber-500/10 rounded px-1.5 py-0.5">
                        exam
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#525252]">
                      {g.assignmentCount} assignment
                      {g.assignmentCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-medium text-[#F5F5F5] w-10 text-right">
                      {(g.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Weight sum warning */}
            {!weightsValid && (
              <p className="text-xs text-amber-500 mt-2">
                Weights sum to {(totalWeight * 100).toFixed(0)}% &mdash;
                expected 100%. This may indicate a parsing error. Confirm only
                if this matches your syllabus.
              </p>
            )}
          </div>

          {/* Clobber policies */}
          {clobberPolicies.length > 0 && (
            <div>
              <p className="text-xs text-[#525252] uppercase tracking-wide mb-2">
                Score Replacement Policies
              </p>
              <div className="space-y-1.5">
                {clobberPolicies.map((p, i) => (
                  <div
                    key={i}
                    className="bg-[#161616] border border-[#1F1F1F] rounded px-3 py-2"
                  >
                    <p className="text-xs text-[#F5F5F5]">
                      {p.sourceName} can replace {p.targetName} if higher
                    </p>
                    <p className="text-[10px] text-[#525252] mt-0.5 italic">
                      &ldquo;{p.conditionText}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1F1F1F] space-y-2">
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded px-3 py-1.5 transition-colors"
          >
            <CheckCircle size={14} />
            {confirming ? 'Confirming...' : 'Looks correct'}
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-[#525252] hover:text-[#A3A3A3] transition-colors"
          >
            Review later
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
