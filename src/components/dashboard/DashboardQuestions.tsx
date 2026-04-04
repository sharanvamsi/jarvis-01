"use client"

import { useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircle, ThumbsUp } from 'lucide-react'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { getCourseColor } from '@/lib/courseColors'
import { relativeTime } from '@/lib/utils'

type EdQuestion = {
  id: string
  title: string
  contentPreview: string | null
  answerCount: number
  voteCount: number
  isAnswered: boolean
  url: string | null
  postedAt: Date | null
  createdAt: Date
  course: { courseCode: string } | null
}

export function DashboardQuestions({ questions }: { questions: EdQuestion[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'recent' | 'popular'>('recent')

  const sorted = [...questions].sort((a, b) => {
    if (sortBy === 'popular') {
      return (b.voteCount + b.answerCount) - (a.voteCount + a.answerCount)
    }
    const da = a.postedAt ? new Date(a.postedAt).getTime() : new Date(a.createdAt).getTime()
    const db = b.postedAt ? new Date(b.postedAt).getTime() : new Date(b.createdAt).getTime()
    return db - da
  })

  return (
    <div className="mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 mb-4 group w-full text-left"
      >
        <h2 className="text-[#A3A3A3] text-lg font-medium">
          Student Questions ({questions.length})
        </h2>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[#525252] group-hover:text-[#A3A3A3] transition-colors" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#525252] group-hover:text-[#A3A3A3] transition-colors" />
        )}
      </button>
      {isOpen && (
        <div>
          {/* Sort toggle */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#525252] text-xs">Sort:</span>
            <button
              onClick={() => setSortBy('recent')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                sortBy === 'recent'
                  ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                  : 'text-[#525252] hover:text-[#A3A3A3]'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                sortBy === 'popular'
                  ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                  : 'text-[#525252] hover:text-[#A3A3A3]'
              }`}
            >
              Popular
            </button>
          </div>

          <div className="space-y-3">
            {sorted.map((q) => {
              const courseCode = q.course?.courseCode ?? ''
              const courseColor = getCourseColor(courseCode)
              const truncated =
                q.contentPreview && q.contentPreview.length > 120
                  ? q.contentPreview.slice(0, 120) + '...'
                  : q.contentPreview
              const qDate = q.postedAt ? new Date(q.postedAt) : new Date(q.createdAt)

              const card = (
                <div
                  className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${q.url ? ' cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
                    >
                      {courseCode}
                    </span>
                    <SourceBadge source="ed-question" />
                    <span className="text-[#525252] text-xs ml-auto">{relativeTime(qDate)}</span>
                  </div>
                  <div className="text-[#F5F5F5] text-sm mb-1">{q.title}</div>
                  {truncated && <div className="text-[#A3A3A3] text-xs mb-2">{truncated}</div>}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1 text-[#A3A3A3]">
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{q.answerCount}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[#A3A3A3]">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{q.voteCount}</span>
                    </div>
                    {q.isAnswered && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Answered
                      </span>
                    )}
                  </div>
                </div>
              )

              return q.url ? (
                <a key={q.id} href={q.url} target="_blank" rel="noopener noreferrer" className="block">
                  {card}
                </a>
              ) : (
                <div key={q.id}>{card}</div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
