'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, Mail, MessageSquare, Users, ExternalLink, Settings } from 'lucide-react'
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

function getCourseColor(courseCode: string): string {
  if (courseCode.includes('162')) return '#3B82F6'
  if (courseCode.includes('189')) return '#8B5CF6'
  if (courseCode.includes('102A')) return '#F59E0B'
  if (courseCode.includes('103')) return '#10B981'
  return '#6B7280'
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

export function CoursesClient({ courses }: { courses: Course[] }) {
  const [selectedId, setSelectedId] = useState(courses[0]?.id ?? '')
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'staff' | 'ed'>('overview')

  if (courses.length === 0) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
        <div className="max-w-[1440px] mx-auto p-4 md:p-8">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen className="w-12 h-12 text-[#525252] mb-4" />
            <h2 className="text-[#F5F5F5] text-lg font-medium mb-2">No courses synced yet</h2>
            <p className="text-[#A3A3A3] text-sm mb-6">Add your Canvas token in Settings to sync your courses</p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#111111] border border-[#1F1F1F] rounded-md text-[#F5F5F5] text-sm hover:bg-[#161616] transition-colors"
            >
              <Settings className="w-4 h-4" />
              Go to Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const selectedCourse = courses.find(c => c.id === selectedId) ?? courses[0]
  const courseColor = getCourseColor(selectedCourse.courseCode)
  const courseAssignments = selectedCourse.assignments
  const courseAnnouncements = selectedCourse.announcements
  const courseEdThreads = selectedCourse.edThreads
  const edAnnouncements = courseEdThreads.filter(t => t.threadType === 'announcement')
  const edQuestions = courseEdThreads.filter(t => t.threadType === 'question')

  const now = new Date()
  const upcomingAssignments = courseAssignments.filter(a => a.dueDate && new Date(a.dueDate) >= now)
  const pastAssignments = courseAssignments.filter(a => !a.dueDate || new Date(a.dueDate) < now)
  const missingAssignments = courseAssignments.filter(a => a.userAssignments?.[0]?.status === 'missing')

  const gradedCount = courseAssignments.filter(a => a.userAssignments?.[0]?.status === 'graded').length
  const submittedCount = courseAssignments.filter(a => a.userAssignments?.[0]?.status === 'submitted').length
  const missingCount = missingAssignments.length

  const hasEd = !!selectedCourse.edCourseId || courseEdThreads.length > 0

  // Merge Canvas + Ed announcements for overview
  const allAnnouncements = [
    ...(courseAnnouncements ?? []).map(a => ({
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
      postedAt: (t.postedAt ?? t.createdAt) as Date | null,
      source: 'ed' as const,
      url: t.url ?? null,
    })),
  ].sort((a, b) => {
    const da = a.postedAt ? new Date(a.postedAt).getTime() : 0
    const db = b.postedAt ? new Date(b.postedAt).getTime() : 0
    return db - da
  }).slice(0, 5)

  const tabs = [
    'overview' as const,
    'assignments' as const,
    'staff' as const,
    ...(hasEd ? ['ed' as const] : []),
  ]

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1440px] mx-auto p-4 md:p-8">
        {/* Course selector */}
        <div className="mb-6">
          <div className="flex gap-2 flex-wrap">
            {courses.map((course) => {
              const isSelected = course.id === selectedCourse.id
              const courseMissingCount = course.assignments.filter(a => {
                if (!a.dueDate || new Date(a.dueDate) >= now) return false
                const ua = a.userAssignments?.[0]
                if (!ua) return true
                return !['submitted', 'graded'].includes(ua.status ?? '')
              }).length
              return (
                <button
                  key={course.id}
                  onClick={() => { setSelectedId(course.id); setActiveTab('overview'); }}
                  className={`px-4 py-2 rounded border text-sm font-medium transition-colors text-left ${
                    isSelected
                      ? 'border-[#3B82F6] text-[#F5F5F5] bg-[#111111]'
                      : 'border-[#1F1F1F] text-[#A3A3A3] hover:bg-[#111111]'
                  }`}
                >
                  <div>{course.courseCode}</div>
                  <div className="flex items-center gap-3 text-xs text-[#A3A3A3] mt-1">
                    <span>{course.assignments.length} assignments</span>
                    {courseMissingCount > 0 && (
                      <span className="text-red-400">{courseMissingCount} missing</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/courses/${selectedCourse.id}`} className="hover:underline">
              <h1 className="text-[28px] font-medium text-[#F5F5F5]">
                {selectedCourse.courseCode}
              </h1>
            </Link>
            <span
              className="px-2.5 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
            >
              {selectedCourse.term ?? 'SP26'}
            </span>
            {selectedCourse.websiteUrl && (
              <a
                href={selectedCourse.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <div className="text-[#A3A3A3]">{selectedCourse.courseName}</div>
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
                  ? `Ed (${courseEdThreads.length})`
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
                <div className="text-[#F5F5F5] text-xl font-medium">{courseAssignments.length}</div>
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
                  {courseAssignments.slice(0, 5).map((assignment) => {
                    const ua = assignment.userAssignments?.[0]
                    const status = (ua?.status ?? 'ungraded') as 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded'
                    return (
                      <div key={assignment.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
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
                  })}
                  {courseAssignments.length === 0 && (
                    <div className="text-[#525252] text-sm">No assignments yet</div>
                  )}
                </div>
              </div>

              {/* Recent announcements (Canvas + Ed merged) */}
              {allAnnouncements.length > 0 ? (
                <div>
                  <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Recent Announcements</h2>
                  <div className="space-y-3">
                    {allAnnouncements.map((ann) => {
                      const annCard = (
                        <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4${ann.url ? ' hover:bg-[#161616] transition-colors cursor-pointer' : ''}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[#F5F5F5] text-sm font-medium line-clamp-2">{ann.title}</span>
                                <SourceBadge source={ann.source} />
                              </div>
                              {ann.body && (
                                <p className="text-[#A3A3A3] text-xs line-clamp-2">{ann.body.slice(0, 120)}</p>
                              )}
                            </div>
                            {ann.url && (
                              <ExternalLink className="w-3.5 h-3.5 text-[#525252] flex-shrink-0" />
                            )}
                          </div>
                          {ann.postedAt && (
                            <div className="text-[#525252] text-xs mt-1">{relativeTime(ann.postedAt)}</div>
                          )}
                        </div>
                      )
                      return ann.url ? (
                        <a key={`${ann.source}-${ann.id}`} href={ann.url} target="_blank" rel="noopener noreferrer" className="block">
                          {annCard}
                        </a>
                      ) : (
                        <div key={`${ann.source}-${ann.id}`}>{annCard}</div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Recent Announcements</h2>
                  <div className="text-[#525252] text-sm py-4 text-center">No announcements yet</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <AssignmentsTab
            all={courseAssignments}
            upcoming={upcomingAssignments}
            past={pastAssignments}
            missing={missingAssignments}
          />
        )}

        {/* Staff Tab */}
        {activeTab === 'staff' && (
          <div className="max-w-2xl">
            {selectedCourse.courseStaff && selectedCourse.courseStaff.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedCourse.courseStaff.map((staff) => (
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
            {courseEdThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="w-10 h-10 text-[#525252] mb-3" />
                <h3 className="text-[#F5F5F5] text-base font-medium mb-1">No Ed discussions</h3>
                <p className="text-[#A3A3A3] text-sm">Connect Ed in Settings to see discussions</p>
              </div>
            ) : (
              <>
                {edAnnouncements.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Announcements</h2>
                    <div className="space-y-3">
                      {edAnnouncements.map((thread) => (
                        <div key={thread.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[#F5F5F5] text-sm font-medium">{thread.title}</span>
                                {thread.isPinned && (
                                  <span className="text-xs text-amber-400">Pinned</span>
                                )}
                              </div>
                              {thread.contentPreview && (
                                <p className="text-[#A3A3A3] text-xs line-clamp-2">{thread.contentPreview}</p>
                              )}
                            </div>
                            {thread.url && (
                              <a href={thread.url} target="_blank" rel="noopener noreferrer" className="text-[#525252] hover:text-[#A3A3A3] flex-shrink-0">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {edQuestions.length > 0 && (
                  <div>
                    <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Questions</h2>
                    <div className="space-y-3">
                      {edQuestions.map((thread) => (
                        <div key={thread.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[#F5F5F5] text-sm font-medium">{thread.title}</span>
                                {thread.isAnswered && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Answered</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-[#525252]">
                                <span>{thread.voteCount} votes</span>
                                <span>{thread.answerCount} answers</span>
                              </div>
                            </div>
                            {thread.url && (
                              <a href={thread.url} target="_blank" rel="noopener noreferrer" className="text-[#525252] hover:text-[#A3A3A3] flex-shrink-0">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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

/* ── Assignments Tab Sub-component ── */

function AssignmentsTab({
  all,
  upcoming,
  past,
  missing,
}: {
  all: Assignment[]
  upcoming: Assignment[]
  past: Assignment[]
  missing: Assignment[]
}) {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past' | 'missing'>('all')

  const filtered = filter === 'all' ? all
    : filter === 'upcoming' ? upcoming
    : filter === 'past' ? past
    : missing

  return (
    <div className="max-w-3xl">
      <div className="flex gap-2 mb-4">
        {(['all', 'upcoming', 'past', 'missing'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-[#1F1F1F] text-[#F5F5F5]'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({
              f === 'all' ? all.length
              : f === 'upcoming' ? upcoming.length
              : f === 'past' ? past.length
              : missing.length
            })
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map((assignment) => {
          const ua = assignment.userAssignments?.[0]
          const status = (ua?.status ?? 'ungraded') as 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded'
          return (
            <div key={assignment.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#F5F5F5] text-sm font-medium truncate">{assignment.name}</span>
                    <SourceBadge source={getAssignmentSource(assignment)} />
                  </div>
                  <div className="flex items-center gap-3 text-[#525252] text-xs">
                    <span>Due {formatDate(assignment.dueDate)}</span>
                    {assignment.assignmentType && (
                      <span className="text-[#525252]">{assignment.assignmentType}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={status} />
                  <ScoreBadge
                    score={ua?.score ?? null}
                    maxScore={assignment.pointsPossible ?? null}
                    status={status}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-[#525252] text-sm py-8 text-center">
            No assignments in this category
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Status Badge ── */

function StatusBadge({ status }: { status: string }) {
  const classes = (() => {
    switch (status) {
      case 'graded': return 'bg-emerald-500/10 text-emerald-400'
      case 'submitted': return 'bg-blue-500/10 text-blue-400'
      case 'missing': return 'bg-red-500/10 text-red-400'
      case 'late': return 'bg-amber-500/10 text-amber-400'
      default: return 'bg-[#1F1F1F] text-[#A3A3A3]'
    }
  })()

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${classes}`}>
      {status}
    </span>
  )
}
