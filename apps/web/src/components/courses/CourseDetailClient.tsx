'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Mail, MessageSquare, Search, Users } from 'lucide-react'
import { ScoreBadge } from '@/components/ui/ScoreBadge'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { stripHtml, relativeTime } from '@/lib/utils'

type UserAssignment = {
  id: string
  score: number | null
  grade: string | null
  status: string
  isLate: boolean
  submittedAt: Date | null
}

type Assignment = {
  id: string
  name: string
  assignmentType: string | null
  dueDate: Date | null
  pointsPossible: number | null
  htmlUrl: string | null
  canvasId: string | null
  gradescopeId: string | null
  userAssignments: UserAssignment[]
}

type Announcement = {
  id: string
  title: string
  message: string | null
  postedAt: Date | null
  htmlUrl: string | null
}

type EdThread = {
  id: string
  title: string
  threadType: string
  isAnnouncement: boolean
  isPinned: boolean
  contentPreview: string | null
  answerCount: number
  voteCount: number
  isAnswered: boolean
  url: string | null
  postedAt: Date | null
  createdAt: Date
}

type CourseStaff = {
  id: string
  name: string
  role: string
  email: string | null
  photoUrl: string | null
}

type Course = {
  id: string
  courseCode: string
  courseName: string
  term: string | null
  edCourseId: string | null
  websiteUrl: string | null
  assignments: Assignment[]
  announcements: Announcement[]
  edThreads: EdThread[]
  courseStaff?: CourseStaff[]
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return 'No date'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getAssignmentSource(a: Assignment): 'canvas' | 'gradescope' | 'website' {
  if (a.canvasId) return 'canvas'
  if (a.gradescopeId) return 'gradescope'
  return 'website'
}

function getStatusClasses(status: string): string {
  switch (status) {
    case 'graded': return 'bg-emerald-500/10 text-emerald-400'
    case 'submitted': return 'bg-blue-500/10 text-blue-400'
    case 'missing': return 'bg-red-500/10 text-red-400'
    case 'late': return 'bg-amber-500/10 text-amber-400'
    default: return 'bg-[#1F1F1F] text-[#A3A3A3]'
  }
}

export function CourseDetailClient({ course }: { course: Course }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'staff' | 'ed'>('overview')
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'upcoming' | 'past' | 'missing'>('all')
  const [edFilter, setEdFilter] = useState<'announcements' | 'questions'>('announcements')
  const [edSort, setEdSort] = useState<'recent' | 'popular'>('recent')
  const [edVisibleCount, setEdVisibleCount] = useState(20)
  const [edSearch, setEdSearch] = useState('')
  const [questionFilter, setQuestionFilter] = useState<'all' | 'answered' | 'unanswered'>('all')

  const assignments = course.assignments
  const announcements = course.announcements
  const edThreads = course.edThreads
  const edAnnouncements = edThreads.filter(t => t.threadType === 'announcement')
  const edQuestions = edThreads.filter(t => t.threadType === 'question')

  const hasEd = !!(course.edCourseId) || edThreads.length > 0

  // Merge Canvas + Ed announcements for overview
  const allAnnouncements = [
    ...(announcements ?? []).map(a => ({
      id: a.id,
      title: a.title,
      body: stripHtml(a.message),
      postedAt: a.postedAt,
      source: 'canvas' as const,
      url: a.htmlUrl ?? null,
    })),
    ...edAnnouncements.map(t => ({
      id: t.id,
      title: t.title,
      body: t.contentPreview ?? '',
      postedAt: t.postedAt ?? t.createdAt,
      source: 'ed' as const,
      url: t.url ?? null,
    })),
  ].sort((a, b) => {
    const da = a.postedAt ? new Date(a.postedAt).getTime() : 0
    const db = b.postedAt ? new Date(b.postedAt).getTime() : 0
    return db - da
  }).slice(0, 5)

  const now = new Date()
  const upcomingAssignments = assignments.filter(a => a.dueDate && new Date(a.dueDate) >= now)
  const pastAssignments = assignments.filter(a => !a.dueDate || new Date(a.dueDate) < now)
  const missingAssignments = assignments.filter(a => a.userAssignments?.[0]?.status === 'missing')

  const gradedCount = assignments.filter(a => a.userAssignments?.[0]?.status === 'graded').length
  const submittedCount = assignments.filter(a => a.userAssignments?.[0]?.status === 'submitted').length
  const missingCount = missingAssignments.length

  const filteredAssignments = assignmentFilter === 'all' ? assignments
    : assignmentFilter === 'upcoming' ? upcomingAssignments
    : assignmentFilter === 'past' ? pastAssignments
    : missingAssignments

  // Ed filtering and sorting
  const baseEdThreads = edFilter === 'announcements' ? edAnnouncements : edQuestions

  const searchFilteredEdThreads = edSearch.trim()
    ? baseEdThreads.filter(t =>
        t.title.toLowerCase().includes(edSearch.toLowerCase()) ||
        (t.contentPreview ?? '').toLowerCase().includes(edSearch.toLowerCase())
      )
    : baseEdThreads

  const filteredEdThreads = edFilter === 'questions' && questionFilter !== 'all'
    ? searchFilteredEdThreads.filter(t =>
        questionFilter === 'answered' ? t.isAnswered : !t.isAnswered
      )
    : searchFilteredEdThreads

  const sortedEdThreads = [...filteredEdThreads].sort((a, b) => {
    if (edSort === 'popular') {
      return (b.voteCount + b.answerCount) - (a.voteCount + a.answerCount)
    }
    const dateA = a.postedAt ? new Date(a.postedAt).getTime() : new Date(a.createdAt).getTime()
    const dateB = b.postedAt ? new Date(b.postedAt).getTime() : new Date(b.createdAt).getTime()
    return dateB - dateA
  })

  const visibleEdThreads = sortedEdThreads.slice(0, edVisibleCount)

  const tabs = [
    'overview' as const,
    'assignments' as const,
    'staff' as const,
    ...(hasEd ? ['ed' as const] : []),
  ]

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1440px] mx-auto p-4 md:p-8">
        {/* Back link */}
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-[#A3A3A3] text-sm hover:text-[#F5F5F5] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All Courses
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-[28px] font-medium text-[#F5F5F5]">
              {course.courseCode}
            </h1>
            <span className="px-2.5 py-1 rounded text-xs font-medium bg-[#1F1F1F] text-[#A3A3A3]">
              {course.term ?? ''}
            </span>
            {course.websiteUrl && (
              <a
                href={course.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <div className="text-[#A3A3A3]">{course.courseName}</div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[#1F1F1F] mb-6">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-[#3B82F6] text-[#F5F5F5]'
                    : 'border-transparent text-[#A3A3A3] hover:text-[#F5F5F5]'
                }`}
              >
                {tab === 'ed'
                  ? `Ed (${edThreads.length})`
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                <div className="text-[#A3A3A3] text-xs mb-1">Total Assignments</div>
                <div className="text-[#F5F5F5] text-xl font-medium">{assignments.length}</div>
              </div>
              <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                <div className="text-[#A3A3A3] text-xs mb-1">Graded</div>
                <div className="text-emerald-400 text-xl font-medium">{gradedCount}</div>
              </div>
              <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                <div className="text-[#A3A3A3] text-xs mb-1">Submitted</div>
                <div className="text-blue-400 text-xl font-medium">{submittedCount}</div>
              </div>
              <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                <div className="text-[#A3A3A3] text-xs mb-1">Missing</div>
                <div className="text-red-400 text-xl font-medium">{missingCount}</div>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${allAnnouncements.length > 0 ? 'lg:grid-cols-[1fr_400px]' : ''} gap-6`}>
              {/* Recent assignments */}
              <div>
                <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Recent Assignments</h2>
                <div className="space-y-3">
                  {assignments.slice(0, 5).map((assignment) => {
                    const ua = assignment.userAssignments?.[0]
                    const status = (ua?.status ?? 'ungraded') as 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded'
                    const card = (
                      <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4${assignment.htmlUrl ? ' hover:bg-[#161616] transition-colors cursor-pointer' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#F5F5F5] text-sm font-medium truncate">{assignment.name}</span>
                              <SourceBadge source={getAssignmentSource(assignment)} />
                            </div>
                            <div className="text-[#525252] text-xs">
                              Due {formatDate(assignment.dueDate)}
                            </div>
                          </div>
                          <ScoreBadge
                            score={ua?.score ?? null}
                            maxScore={assignment.pointsPossible ?? null}
                            status={status}
                          />
                        </div>
                      </div>
                    )
                    return assignment.htmlUrl ? (
                      <a key={assignment.id} href={assignment.htmlUrl} target="_blank" rel="noopener noreferrer" className="block">
                        {card}
                      </a>
                    ) : (
                      <div key={assignment.id}>{card}</div>
                    )
                  })}
                  {assignments.length === 0 && (
                    <div className="text-[#525252] text-sm">No assignments yet</div>
                  )}
                </div>
              </div>

              {/* Recent announcements (Canvas + Ed merged) */}
              <div>
                <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Recent Announcements</h2>
                <div className="space-y-3">
                  {allAnnouncements.length > 0 ? allAnnouncements.map((ann) => {
                    const annCard = (
                      <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4${ann.url ? ' hover:bg-[#161616] transition-colors cursor-pointer' : ''}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#F5F5F5] text-sm font-medium line-clamp-2">{ann.title}</span>
                              <SourceBadge source={ann.source} />
                            </div>
                            {ann.body && (
                              <p className="text-[#A3A3A3] text-xs line-clamp-2 mb-1">{ann.body.slice(0, 120)}</p>
                            )}
                          </div>
                          {ann.url && (
                            <ExternalLink className="w-3.5 h-3.5 text-[#525252] flex-shrink-0 mt-0.5" />
                          )}
                        </div>
                        {ann.postedAt && <div className="text-[#525252] text-xs">{relativeTime(ann.postedAt)}</div>}
                      </div>
                    )
                    return ann.url ? (
                      <a key={`${ann.source}-${ann.id}`} href={ann.url} target="_blank" rel="noopener noreferrer" className="block">
                        {annCard}
                      </a>
                    ) : (
                      <div key={`${ann.source}-${ann.id}`}>{annCard}</div>
                    )
                  }) : (
                    <div className="text-[#525252] text-sm py-4 text-center">No announcements yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div className="max-w-3xl">
            <div className="flex gap-2 mb-4">
              {(['all', 'upcoming', 'past', 'missing'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setAssignmentFilter(f)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    assignmentFilter === f
                      ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                      : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({
                    f === 'all' ? assignments.length
                    : f === 'upcoming' ? upcomingAssignments.length
                    : f === 'past' ? pastAssignments.length
                    : missingAssignments.length
                  })
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {filteredAssignments.map((assignment) => {
                const ua = assignment.userAssignments?.[0]
                const status = (ua?.status ?? 'ungraded') as 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded'
                const aCard = (
                  <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${assignment.htmlUrl ? ' cursor-pointer' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[#F5F5F5] text-sm font-medium truncate">{assignment.name}</span>
                          <SourceBadge source={getAssignmentSource(assignment)} />
                        </div>
                        <div className="flex items-center gap-3 text-[#525252] text-xs">
                          <span>Due {formatDate(assignment.dueDate)}</span>
                          {assignment.assignmentType && (
                            <span>{assignment.assignmentType}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${getStatusClasses(status)}`}>
                          {status}
                        </span>
                        <ScoreBadge
                          score={ua?.score ?? null}
                          maxScore={assignment.pointsPossible ?? null}
                          status={status}
                        />
                      </div>
                    </div>
                  </div>
                )
                return assignment.htmlUrl ? (
                  <a key={assignment.id} href={assignment.htmlUrl} target="_blank" rel="noopener noreferrer" className="block">
                    {aCard}
                  </a>
                ) : (
                  <div key={assignment.id}>{aCard}</div>
                )
              })}
              {filteredAssignments.length === 0 && (
                <div className="text-[#525252] text-sm py-8 text-center">
                  No assignments in this category
                </div>
              )}
            </div>
          </div>
        )}

        {/* Staff Tab */}
        {activeTab === 'staff' && (
          <div className="max-w-2xl">
            {course.courseStaff && course.courseStaff.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {course.courseStaff.map((staff) => (
                  <div key={staff.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-[#1F1F1F] flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-[#525252]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[#F5F5F5] text-sm font-medium truncate">{staff.name}</div>
                        <div className="text-[#A3A3A3] text-xs capitalize mt-0.5">{staff.role}</div>
                        {staff.email && (
                          <a
                            href={`mailto:${staff.email}`}
                            className="inline-flex items-center gap-1 text-[#525252] hover:text-[#A3A3A3] text-xs mt-1 transition-colors"
                          >
                            <Mail className="w-3 h-3" />
                            {staff.email}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="w-10 h-10 text-[#525252] mb-3" />
                <h3 className="text-[#F5F5F5] text-base font-medium mb-1">Staff info unavailable</h3>
                <p className="text-[#A3A3A3] text-sm">Staff info available after course website is synced</p>
              </div>
            )}
          </div>
        )}

        {/* Ed Tab */}
        {activeTab === 'ed' && (
          <div className="max-w-3xl">
            {edThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="w-10 h-10 text-[#525252] mb-3" />
                <h3 className="text-[#F5F5F5] text-base font-medium mb-1">No Ed discussions</h3>
                <p className="text-[#A3A3A3] text-sm">Connect Ed in Settings to see discussions</p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#525252]" />
                  <input
                    type="text"
                    placeholder={`Search ${course.courseCode} discussions...`}
                    value={edSearch}
                    onChange={e => setEdSearch(e.target.value)}
                    className="w-full bg-[#1F1F1F] border border-[#333] text-[#F5F5F5] placeholder-[#525252] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#444]"
                  />
                  {edSearch && (
                    <button
                      onClick={() => setEdSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#A3A3A3] text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Filter bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    {([
                      ['announcements', 'Announcements', edAnnouncements.length],
                      ['questions', 'Questions', edQuestions.length],
                    ] as const).map(([key, label, count]) => (
                      <button
                        key={key}
                        onClick={() => { setEdFilter(key); setEdVisibleCount(20); setEdSearch('') }}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          edFilter === key
                            ? 'bg-[#1F1F1F] text-[#F5F5F5] border border-[#333]'
                            : 'text-[#525252] hover:text-[#A3A3A3]'
                        }`}
                      >
                        {label} ({count})
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#525252]">
                    <span>Sort:</span>
                    {(['recent', 'popular'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setEdSort(s)}
                        className={`px-2 py-1 rounded transition-colors ${
                          edSort === s ? 'text-[#F5F5F5] bg-[#1F1F1F]' : 'hover:text-[#A3A3A3]'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question sub-filter */}
                {edFilter === 'questions' && (
                  <div className="flex gap-2 mb-4">
                    {(['all', 'answered', 'unanswered'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setQuestionFilter(f)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          questionFilter === f
                            ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                            : 'text-[#525252] hover:text-[#A3A3A3]'
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Thread list */}
                <div className="space-y-3">
                  {visibleEdThreads.map((thread) => {
                    const threadDate = thread.postedAt
                      ? new Date(thread.postedAt)
                      : new Date(thread.createdAt)
                    const isQuestion = thread.threadType === 'question'
                    const threadCard = (
                      <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${thread.url ? ' cursor-pointer' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#F5F5F5] text-sm font-medium">{thread.title}</span>
                              {thread.isPinned && (
                                <span className="text-xs text-amber-400">Pinned</span>
                              )}
                              {!isQuestion && thread.isAnnouncement && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Staff</span>
                              )}
                              {isQuestion && thread.isAnswered && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Answered</span>
                              )}
                            </div>
                            {thread.contentPreview && (
                              <p className="text-[#A3A3A3] text-xs line-clamp-2 mb-1">{thread.contentPreview}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-[#525252]">
                              <span>{relativeTime(threadDate)}</span>
                              {isQuestion && (
                                <>
                                  <span>{thread.answerCount} {thread.answerCount === 1 ? 'answer' : 'answers'}</span>
                                  <span>{thread.voteCount} votes</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                    return thread.url ? (
                      <a key={thread.id} href={thread.url} target="_blank" rel="noopener noreferrer" className="block">
                        {threadCard}
                      </a>
                    ) : (
                      <div key={thread.id}>{threadCard}</div>
                    )
                  })}
                </div>

                {/* Load more + count */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-[#525252] text-xs">
                    Showing {Math.min(edVisibleCount, sortedEdThreads.length)} of {sortedEdThreads.length}
                  </span>
                  {edVisibleCount < sortedEdThreads.length && (
                    <button
                      onClick={() => setEdVisibleCount(v => v + 20)}
                      className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                    >
                      Load more
                    </button>
                  )}
                </div>

                {sortedEdThreads.length === 0 && (
                  <div className="text-[#525252] text-sm py-8 text-center">
                    No {edFilter} found{edSearch ? ` matching "${edSearch}"` : ''} for {course.courseCode}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
