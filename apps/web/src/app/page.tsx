export const revalidate = 30;

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/dashboard/StatCard';
import { UnifiedAnnouncementCard } from '@/components/dashboard/UnifiedAnnouncementCard';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { DashboardQuestions } from '@/components/dashboard/DashboardQuestions';
import { OfficeHoursCard } from '@/components/dashboard/OfficeHoursCard';
import { ExamCard } from '@/components/dashboard/ExamCard';
import { getCourseColor } from '@/lib/courseColors';
import { daysUntil, daysOverdue, stripHtml } from '@/lib/utils';
import {
  requireAuth,
  getUpcomingAssignments,
  getMissingAssignments,
  getCanvasAnnouncements,
  getEdThreads,
  getTodaysEvents,
  hasCalendarEvents,
  getDashboardStats,
  getTodaysOfficeHours,
  getUpcomingExams,
  hasCanvasToken,
  hasEdToken,
  hasGradescopeToken,
  getGradescopeSyncError,
} from '@/lib/data';

export default async function Dashboard() {
  const user = await requireAuth();
  const firstName = user.name?.split(' ')[0] ?? 'Student';

  const [
    upcoming,
    missing,
    canvasAnnouncements,
    edAnnouncements,
    edQuestions,
    todaysEvents,
    calendarConnected,
    stats,
    todaysOfficeHours,
    upcomingExams,
    canvasConnected,
    edConnected,
    gradescopeConnected,
    gradescopeSyncError,
  ] = await Promise.all([
    getUpcomingAssignments(user.id),
    getMissingAssignments(user.id),
    getCanvasAnnouncements(user.id),
    getEdThreads(user.id, 'announcement'),
    getEdThreads(user.id, 'question'),
    getTodaysEvents(user.id),
    hasCalendarEvents(user.id),
    getDashboardStats(user.id),
    getTodaysOfficeHours(user.id),
    getUpcomingExams(user.id),
    hasCanvasToken(user.id),
    hasEdToken(user.id),
    hasGradescopeToken(user.id),
    getGradescopeSyncError(user.id),
  ]);

  // Use Pacific time (Berkeley) so the date/greeting are correct on Vercel (UTC)
  const TZ = 'America/Los_Angeles';
  const now = new Date();
  const pacificHour = parseInt(
    now.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })
  );
  const greeting =
    pacificHour < 12
      ? 'Good morning'
      : pacificHour < 18
        ? 'Good afternoon'
        : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Merge Canvas + Ed staff announcements into unified "Course Updates"
  const courseUpdates = [
    ...canvasAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      body: stripHtml(a.message),
      postedAt: a.postedAt ? new Date(a.postedAt) : new Date(a.createdAt),
      source: 'canvas' as const,
      url: a.htmlUrl,
      courseCode: a.course?.courseCode ?? '',
    })),
    ...edAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.contentPreview,
      postedAt: a.postedAt ? new Date(a.postedAt) : new Date(a.createdAt),
      source: 'ed' as const,
      url: a.url,
      courseCode: a.course?.courseCode ?? '',
    })),
  ]
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, 15);

  // Pass questions to client component for sorting (default: recent)
  const sortedQuestions = edQuestions.slice(0, 20);

  const upcomingNotSubmitted = upcoming.filter((a) => !a.submitted);

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20 md:pb-0">
      <div className="max-w-[1440px] mx-auto p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <div className="flex items-end justify-between mb-2">
            <h1 className="text-2xl md:text-[28px] font-medium text-[#F5F5F5]">
              {greeting}, {firstName}
            </h1>
            <span className="hidden md:inline-block px-2.5 py-1 rounded bg-[#111111] border border-[#1F1F1F] text-[#A3A3A3] text-xs">
              Live data
            </span>
          </div>
          <div className="text-[#A3A3A3] text-sm">{dateStr}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          <StatCard
            title="Due This Week"
            value={stats.dueThisWeek}
            subtitle={stats.missingCount > 0 ? `${stats.missingCount} missing` : 'on track'}
            subtitleColor={stats.missingCount > 0 ? 'warning' : 'default'}
          />
          <StatCard title="Total Assignments" value={stats.totalAssignments} subtitle="this semester" />
          <StatCard
            title="Events Today"
            value={todaysEvents.length}
            subtitle={todaysEvents.length > 0 ? 'from calendar' : calendarConnected ? 'nothing scheduled' : 'connect calendar'}
          />
          <StatCard
            title="Announcements"
            value={courseUpdates.length}
            subtitle="recent"
          />
        </div>

        {gradescopeSyncError && (
          <div className="mb-4 flex items-center gap-3 bg-[#111111] border border-amber-500/30 rounded-md p-3">
            <span className="text-amber-500 text-sm">!</span>
            <p className="text-xs text-[#A3A3A3]">
              Gradescope sync failed — your grades may be outdated.{' '}
              <a href="/settings" className="text-amber-400 hover:text-amber-300 underline">
                Update credentials &rarr;
              </a>
            </p>
          </div>
        )}

        {!canvasConnected && (
          <div className="mb-6 flex items-start gap-3 bg-[#111111] border border-amber-500/30 rounded-md p-4">
            <div className="w-8 h-8 rounded bg-amber-600/20 flex items-center justify-center shrink-0">
              <span className="text-amber-500 text-sm">!</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#F5F5F5]">
                Connect Canvas to unlock your full dashboard
              </p>
              <p className="text-xs text-[#A3A3A3] mt-0.5">
                Canvas provides your course list, assignments, and grades.
                {edConnected || gradescopeConnected
                  ? ' Your other integrations are ready and will sync automatically once Canvas is connected.'
                  : ''}
              </p>
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Connect Canvas &rarr;
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* LEFT COLUMN */}
          <div>
            {/* DUE SOON */}
            {upcomingNotSubmitted.length > 0 ? (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[#F5F5F5] text-lg font-medium">Due Soon</h2>
                  <Link
                    href="/courses"
                    className="flex items-center gap-1 text-[#3B82F6] text-sm hover:text-[#60A5FA] transition-colors"
                  >
                    View all <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                <div className="space-y-3">
                  {upcomingNotSubmitted.slice(0, 5).map((a) => {
                    const courseColor = getCourseColor(a.courseCode);
                    const cardContent = (
                      <div
                        className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${a.htmlUrl ? ' cursor-pointer' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium"
                                style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
                              >
                                {a.courseCode}
                              </span>
                            </div>
                            <div className="text-[#F5F5F5] text-sm font-medium mb-1">{a.name}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {a.pointsPossible ? (
                              <span className="text-xs text-[#A3A3A3] bg-[#1F1F1F] border border-[#2a2a2a] px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                {a.pointsPossible} pts
                              </span>
                            ) : null}
                            {a.dueDate && (
                              <div className="text-[#A3A3A3] text-xs mt-1">{daysUntil(a.dueDate)}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                    return a.htmlUrl ? (
                      <a key={a.id} href={a.htmlUrl} target="_blank" rel="noopener noreferrer" className="block">
                        {cardContent}
                      </a>
                    ) : (
                      <div key={a.id}>{cardContent}</div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-8 bg-[#111111] border border-[#1F1F1F] rounded-md p-8 text-center">
                <div className="text-[#525252] text-sm">Nothing due in the next 2 weeks</div>
              </div>
            )}

            {/* MISSING ASSIGNMENTS */}
            {missing.length > 0 && (
              <CollapsibleSection
                title="Missing"
                count={missing.length}
                defaultOpen={missing.length <= 3}
                headerClassName="text-amber-500"
              >
                {missing.map((a) => {
                  const courseColor = getCourseColor(a.courseCode);
                  const cardContent = (
                    <div
                      className={`bg-[#111111] border border-[#1F1F1F] border-l-2 border-l-red-500 rounded-md p-4 hover:bg-[#161616] transition-colors${a.htmlUrl ? ' cursor-pointer' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
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
                  );
                  return a.htmlUrl ? (
                    <a key={a.id} href={a.htmlUrl} target="_blank" rel="noopener noreferrer" className="block">
                      {cardContent}
                    </a>
                  ) : (
                    <div key={a.id}>{cardContent}</div>
                  );
                })}
              </CollapsibleSection>
            )}

            {/* COURSE UPDATES (Canvas + Ed announcements merged) */}
            {courseUpdates.length > 0 ? (
              <div className="mb-8">
                <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Course Updates</h2>
                <div className="space-y-3">
                  {courseUpdates.slice(0, 8).map((u) => (
                    <UnifiedAnnouncementCard
                      key={`${u.source}-${u.id}`}
                      title={u.title}
                      body={u.body ?? null}
                      postedAt={u.postedAt}
                      source={u.source}
                      courseCode={u.courseCode}
                      url={u.url ?? null}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-8 bg-[#111111] border border-[#1F1F1F] rounded-md p-8 text-center">
                <div className="text-[#525252] text-sm">No announcements yet</div>
              </div>
            )}

            {/* STUDENT QUESTIONS */}
            {sortedQuestions.length > 0 && (
              <DashboardQuestions questions={sortedQuestions} />
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <div className="mb-8">
              <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Today&apos;s Events</h2>
              {todaysEvents.length > 0 ? (
                <div className="space-y-3">
                  {todaysEvents.map((c) => (
                    <div key={c.id} className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4">
                      <div className="text-[#F5F5F5] text-sm font-medium">{c.title}</div>
                      <div className="text-[#A3A3A3] text-xs mt-1">
                        {new Date(c.startTime).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/Los_Angeles',
                        })}{' '}
                        &mdash;{' '}
                        {new Date(c.endTime).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/Los_Angeles',
                        })}
                      </div>
                      {c.location && <div className="text-[#525252] text-xs mt-0.5">{c.location}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 text-center">
                  {calendarConnected ? (
                    <div className="text-[#A3A3A3] text-sm">Nothing scheduled today</div>
                  ) : (
                    <>
                      <div className="text-[#A3A3A3] text-sm">No events</div>
                      <Link
                        href="/settings"
                        className="text-[#3B82F6] text-xs hover:text-[#60A5FA] mt-1 inline-block"
                      >
                        Connect Google Calendar in Settings
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* TODAY'S OFFICE HOURS */}
            <div className="mb-8">
              <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Office Hours Today</h2>
              {todaysOfficeHours.length > 0 ? (
                <div className="space-y-3">
                  {todaysOfficeHours.map((oh) => (
                    <OfficeHoursCard key={oh.id} officeHour={oh} />
                  ))}
                </div>
              ) : (
                <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 text-center">
                  <p className="text-[#525252] text-sm">No office hours today</p>
                </div>
              )}
            </div>

            {/* UPCOMING EXAMS */}
            {upcomingExams.length > 0 && (
              <div>
                <h2 className="text-[#F5F5F5] text-lg font-medium mb-4">Upcoming Exams</h2>
                <div className="space-y-3">
                  {upcomingExams.map((exam) => (
                    <ExamCard key={exam.id} exam={exam} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
