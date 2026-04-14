"use client"

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { getCourseColor } from '@/lib/courseColors'
import { daysOverdue } from '@/lib/utils'

interface MissingAssignment {
  id: string
  name: string
  courseCode: string
  dueDate: Date | string | null
  htmlUrl: string | null
  specUrl?: string | null
  pointsPossible: number | null
  daysOverdue: number | null
  status: string
  source: string
}

interface Props {
  missing: MissingAssignment[]
  semesterKey: string
}

const LS_DISMISSED_KEY = 'jarvis-dismissed-missing'
const LS_SEMESTER_KEY = 'jarvis-dismissed-semester'

export function MissingSection({ missing, semesterKey }: Props) {
  const [dismissedIds, setDismissedIds] = useState<string[]>([])

  useEffect(() => {
    const storedSemester = localStorage.getItem(LS_SEMESTER_KEY)
    if (storedSemester !== semesterKey) {
      localStorage.removeItem(LS_DISMISSED_KEY)
      localStorage.setItem(LS_SEMESTER_KEY, semesterKey)
      setDismissedIds([])
      return
    }
    try {
      const stored = localStorage.getItem(LS_DISMISSED_KEY)
      if (stored) setDismissedIds(JSON.parse(stored))
    } catch {
      // ignore malformed data
    }
  }, [semesterKey])

  function dismiss(id: string) {
    const next = [...dismissedIds, id]
    setDismissedIds(next)
    localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify(next))
  }

  function restore() {
    setDismissedIds([])
    localStorage.removeItem(LS_DISMISSED_KEY)
  }

  const visible = missing.filter((a) => !dismissedIds.includes(a.id))

  if (visible.length === 0 && missing.length === 0) return null

  if (visible.length === 0 && missing.length > 0) {
    return (
      <div className="mb-8">
        <button
          onClick={restore}
          className="text-[#525252] hover:text-[#A3A3A3] text-xs"
        >
          Show {dismissedIds.length} hidden assignment{dismissedIds.length !== 1 ? 's' : ''}
        </button>
      </div>
    )
  }

  return (
    <CollapsibleSection
      title="Missing"
      count={visible.length}
      defaultOpen={visible.length <= 3}
      headerClassName="text-amber-500"
    >
      {visible.map((a) => {
        const courseColor = getCourseColor(a.courseCode)
        const url = a.htmlUrl || a.specUrl
        const cardContent = (
          <div
            className={`relative bg-[#111111] border border-[#1F1F1F] border-l-2 border-l-red-500 rounded-md p-4 hover:bg-[#161616] transition-colors${url ? ' cursor-pointer' : ''}`}
          >
            <button
              className="absolute top-2 right-2 text-[#525252] hover:text-[#A3A3A3] p-1"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                dismiss(a.id)
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
                  >
                    {a.courseCode}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400">
                    missing
                  </span>
                </div>
                <div className="text-[#F5F5F5] text-sm font-medium">{a.name}</div>
              </div>
              <div className="text-right flex-shrink-0">
                {a.dueDate && (
                  <div className="text-red-400 text-xs">{daysOverdue(a.dueDate)}</div>
                )}
              </div>
            </div>
          </div>
        )
        return url ? (
          <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="block">
            {cardContent}
          </a>
        ) : (
          <div key={a.id}>{cardContent}</div>
        )
      })}
      {dismissedIds.length > 0 && (
        <button
          onClick={restore}
          className="text-[#525252] hover:text-[#A3A3A3] text-xs mt-2"
        >
          Show {dismissedIds.length} hidden
        </button>
      )}
    </CollapsibleSection>
  )
}
