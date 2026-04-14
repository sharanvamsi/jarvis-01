"use client"

import { useState } from 'react'
import { MessageCircle, ThumbsUp } from 'lucide-react'
import { UnifiedAnnouncementCard } from '@/components/dashboard/UnifiedAnnouncementCard'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { getCourseColor } from '@/lib/courseColors'
import { relativeTime } from '@/lib/utils'

interface Announcement {
  id: string
  title: string
  body: string | null
  postedAt: Date | string
  source: string
  courseCode: string
  url: string | null
}

interface EdQuestion {
  id: string
  title: string
  contentPreview: string | null
  threadType: string
  postedAt: Date | string | null
  url: string | null
  voteCount: number
  answerCount: number
  isAnswered: boolean
  courseCode: string
}

interface Props {
  announcements: Announcement[]
  questions: EdQuestion[]
}

export function DashboardUpdates({ announcements, questions }: Props) {
  const [activeTab, setActiveTab] = useState<'announcements' | 'questions'>('announcements')
  const [questionSort, setQuestionSort] = useState<'recent' | 'popular'>('recent')

  const sortedQuestions = [...questions].sort((a, b) => {
    if (questionSort === 'popular') {
      return (b.voteCount + b.answerCount) - (a.voteCount + a.answerCount)
    }
    const da = a.postedAt ? new Date(a.postedAt).getTime() : 0
    const db = b.postedAt ? new Date(b.postedAt).getTime() : 0
    return db - da
  })

  return (
    <div className="mb-8">
      <div className="flex items-center gap-6 mb-4">
        <h2 className="text-[#F5F5F5] text-lg font-medium">Updates</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab('announcements')}
            className={`text-sm pb-2 transition-colors ${
              activeTab === 'announcements'
                ? 'border-b-2 border-[#3B82F6] text-[#F5F5F5]'
                : 'border-b-2 border-transparent text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            Announcements ({announcements.length})
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`text-sm pb-2 transition-colors ${
              activeTab === 'questions'
                ? 'border-b-2 border-[#3B82F6] text-[#F5F5F5]'
                : 'border-b-2 border-transparent text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            Questions ({questions.length})
          </button>
        </div>
      </div>

      {activeTab === 'announcements' && (
        announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((u) => (
              <UnifiedAnnouncementCard
                key={`${u.source}-${u.id}`}
                title={u.title}
                body={u.body ?? null}
                postedAt={new Date(u.postedAt)}
                source={u.source as 'canvas' | 'ed'}
                courseCode={u.courseCode}
                url={u.url ?? null}
              />
            ))}
          </div>
        ) : (
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-8 text-center">
            <div className="text-[#525252] text-sm">No announcements yet</div>
          </div>
        )
      )}

      {activeTab === 'questions' && (
        questions.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#525252] text-xs">Sort:</span>
              <button
                onClick={() => setQuestionSort('recent')}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  questionSort === 'recent'
                    ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                    : 'text-[#525252] hover:text-[#A3A3A3]'
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => setQuestionSort('popular')}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  questionSort === 'popular'
                    ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                    : 'text-[#525252] hover:text-[#A3A3A3]'
                }`}
              >
                Popular
              </button>
            </div>

            <div className="space-y-3">
              {sortedQuestions.map((q) => {
                const courseColor = getCourseColor(q.courseCode)
                const truncated =
                  q.contentPreview && q.contentPreview.length > 120
                    ? q.contentPreview.slice(0, 120) + '...'
                    : q.contentPreview
                const qDate = q.postedAt ? new Date(q.postedAt) : null

                const card = (
                  <div
                    className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${q.url ? ' cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
                      >
                        {q.courseCode}
                      </span>
                      <SourceBadge source="ed-question" />
                      <span className="text-[#525252] text-xs ml-auto">{qDate ? relativeTime(qDate) : ''}</span>
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
        ) : (
          <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-8 text-center">
            <div className="text-[#525252] text-sm">No questions yet</div>
          </div>
        )
      )}
    </div>
  )
}
