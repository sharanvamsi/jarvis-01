'use client'

import { ChevronDown } from 'lucide-react'
import type { GroupBreakdown } from '@/lib/projection'

interface Props {
  breakdown: GroupBreakdown[]
  method: 'weighted' | 'curved'
  expanded: boolean
  onToggle: () => void
}

export default function GradeBreakdown({ breakdown, method, expanded, onToggle }: Props) {

  if (breakdown.length === 0) return null

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md mb-4 overflow-hidden">
      {/* Header — click to toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#161616] transition-colors"
      >
        <span className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wide">
          Grade Breakdown
        </span>
        <ChevronDown
          size={14}
          className={`text-[#525252] transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-[#1F1F1F]">
          {breakdown.map((group) => {
            const weightPct = (group.weight * 100).toFixed(0)
            const hasScore = group.score !== null

            return (
              <div
                key={group.groupId}
                className="px-4 py-2.5 border-b border-[#1F1F1F] last:border-0"
              >
                <div className="flex items-center justify-between mb-1">
                  {/* Group name + badges */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-[#F5F5F5] truncate">
                      {group.groupName}
                    </span>
                    {group.isExam && (
                      <span className="text-[10px] text-amber-500/70 bg-amber-500/10 rounded px-1.5 py-0.5 shrink-0">
                        exam
                      </span>
                    )}
                    {group.clobbered && (
                      <span className="text-[10px] text-blue-400/70 bg-blue-500/10 rounded px-1.5 py-0.5 shrink-0">
                        replaced
                      </span>
                    )}
                    {group.hasHypothetical && (
                      <span className="text-[10px] text-blue-400/70 bg-blue-500/10 rounded px-1.5 py-0.5 shrink-0">
                        edited
                      </span>
                    )}
                  </div>

                  {/* Score + weight */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium ${
                        hasScore
                          ? group.hasHypothetical ? 'text-blue-400' : 'text-[#F5F5F5]'
                          : 'text-[#525252]'
                      }`}>
                        {hasScore
                          ? method === 'curved'
                            ? `z = ${group.score!.toFixed(2)}`
                            : `${group.score!.toFixed(1)}%`
                          : 'pending'}
                      </span>
                      {method === 'curved' && group.isExam && group.examZScore !== null && (
                        <span className={`text-xs ${group.examZScore >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {group.examZScore >= 0 ? '+' : ''}{group.examZScore.toFixed(2)}{'\u03C3'}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#525252] w-8 text-right">
                      {weightPct}%
                    </span>
                  </div>
                </div>

                {/* Exam stats detail for curved */}
                {method === 'curved' && group.isExam && group.examMean !== null && group.examStdDev !== null && (
                  <div className="flex justify-end">
                    <span className="text-[10px] text-[#525252]">
                      {'\u03BC'}={group.examMean.toFixed(1)} {'\u03C3'}={group.examStdDev.toFixed(1)}
                    </span>
                  </div>
                )}

                {/* Progress bar (weighted only) */}
                {method === 'weighted' && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-[#1F1F1F] rounded-full overflow-hidden">
                      {hasScore && (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(group.score!, 100)}%`,
                            backgroundColor: group.hasHypothetical ? '#3B82F6' : '#10B981',
                          }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-[#525252] w-20 text-right">
                      {group.gradedCount}/{group.assignmentCount} graded
                    </span>
                  </div>
                )}

                {/* Dropped assignments */}
                {group.dropped.length > 0 && (
                  <p className="text-[10px] text-[#525252] mt-1">
                    Dropped: <span className="line-through">{group.dropped.join(', ')}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
