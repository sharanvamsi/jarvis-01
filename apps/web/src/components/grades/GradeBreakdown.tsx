'use client'

import { ChevronDown } from 'lucide-react'
import type { GroupBreakdown } from '@/lib/projection'

interface Props {
  breakdown: GroupBreakdown[]
  method: 'weighted' | 'curved'
  isPointsBased?: boolean
  expanded: boolean
  onToggle: () => void
}

export default function GradeBreakdown({ breakdown, method, isPointsBased, expanded, onToggle }: Props) {

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
            const weightLabel = isPointsBased
              ? `${group.weight} pts`
              : `${(group.weight * 100).toFixed(0)}%`
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
                    <span className={`text-xs text-[#525252] text-right ${isPointsBased ? 'w-14' : 'w-8'}`}>
                      {weightLabel}
                    </span>
                  </div>
                </div>

                {/* Per-exam assignment detail for curved */}
                {method === 'curved' && group.isExam && group.examAssignments.length > 0 && (
                  <div className="mt-1 bg-[#0D0D0D] rounded -mx-1 px-1">
                    {group.examAssignments.map(ea => (
                      <div key={ea.name} className="flex items-center justify-between py-1">
                        <span className="text-[11px] text-[#A3A3A3] truncate mr-2">{ea.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          {ea.score !== null && (
                            <span className="text-[11px] text-[#A3A3A3]">
                              {ea.score} pts
                            </span>
                          )}
                          {ea.mean !== null && ea.stdDev !== null && (
                            <span className="text-[10px] text-[#525252]">
                              {'\u03BC'}={ea.mean.toFixed(1)} {'\u03C3'}={ea.stdDev.toFixed(1)}
                            </span>
                          )}
                          {ea.zScore !== null && (
                            <span className={`text-[11px] font-medium ${
                              ea.zScore >= 0 ? 'text-emerald-500' : 'text-red-400'
                            }`}>
                              {ea.zScore >= 0 ? '+' : ''}{ea.zScore.toFixed(2)}{'\u03C3'}
                            </span>
                          )}
                          {ea.mean === null && (
                            <span className="text-[10px] text-amber-500">stats needed</span>
                          )}
                        </div>
                      </div>
                    ))}
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
