import { db } from "./db"
import { auth } from "./auth"
import { redirect } from "next/navigation"

// ── AUTH HELPER ───────────────────────────────────────────────
export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) redirect("/onboarding")
  return session.user as { id: string; name?: string | null; email?: string | null; image?: string | null }
}

// ── COURSES ───────────────────────────────────────────────────
export async function getUserCourses(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            assignments: {
              where: { isCurrentSemester: true },
              include: {
                userAssignments: { where: { userId } },
              },
              orderBy: { dueDate: "asc" },
            },
            announcements: {
              orderBy: { postedAt: "desc" },
              take: 10,
            },
            edThreads: {
              orderBy: { postedAt: "desc" },
              take: 200,
            },
            courseStaff: { orderBy: { role: 'asc' } },
          },
        },
      },
    })
    return enrollments
      .map((e) => e.course)
      .filter((c) => c.isCurrentSemester)
  } catch (error) {
    console.error("[data] getUserCourses:", error)
    return []
  }
}

export async function getCourseById(courseId: string, userId: string) {
  try {
    return await db.course.findUnique({
      where: { id: courseId },
      include: {
        assignments: {
          include: {
            userAssignments: { where: { userId } },
          },
          orderBy: { dueDate: "asc" },
        },
        announcements: {
          orderBy: { postedAt: "desc" },
          take: 20,
        },
        edThreads: {
          orderBy: { postedAt: "desc" },
          take: 200,
        },
        enrollments: { where: { userId } },
        courseStaff: { orderBy: { role: 'asc' } },
        officeHours: true,
        exams: { orderBy: { date: 'asc' } },
      },
    })
  } catch (error) {
    console.error("[data] getCourseById:", error)
    return null
  }
}

// ── ASSIGNMENTS ────────────────────────────────────────────────
export async function getUpcomingAssignments(userId: string, days = 14) {
  try {
    const now = new Date()
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    const assignments = await db.assignment.findMany({
      where: {
        courseId: { in: courseIds },
        isCurrentSemester: true,
        dueDate: { gte: now, lte: future },
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
        userAssignments: { where: { userId } },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    })

    return assignments.map((a) => {
      const ua = a.userAssignments[0]
      const dueDate = a.dueDate ? new Date(a.dueDate) : null
      const daysUntil = dueDate
        ? Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
        : null

      return {
        id: a.id,
        name: a.name,
        courseCode: a.course.courseCode,
        courseName: a.course.courseName,
        dueDate,
        daysUntil,
        overdue: false,
        pointsPossible: a.pointsPossible,
        score: ua?.score ?? null,
        status: ua?.status ?? "ungraded",
        submitted:
          ua?.status === "submitted" || ua?.status === "graded",
        source: a.canvasId
          ? "Canvas"
          : a.gradescopeId
            ? "Gradescope"
            : "Website",
        htmlUrl: a.htmlUrl,
      }
    })
  } catch (error) {
    console.error("[data] getUpcomingAssignments:", error)
    return []
  }
}

export async function getMissingAssignments(userId: string) {
  try {
    const now = new Date()
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    const pastDue = await db.assignment.findMany({
      where: {
        courseId: { in: courseIds },
        isCurrentSemester: true,
        dueDate: { lt: now, not: null },
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
        userAssignments: { where: { userId } },
      },
      orderBy: { dueDate: "desc" },
    })

    return pastDue
      .filter((a) => {
        const ua = a.userAssignments[0]
        if (!ua) return true
        return !["submitted", "graded"].includes(ua.status ?? "")
      })
      .slice(0, 20)
      .map((a) => {
        const ua = a.userAssignments[0]
        const dueDate = a.dueDate ? new Date(a.dueDate) : null
        const daysOverdue = dueDate
          ? Math.floor(
              (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            )
          : null

        return {
          id: a.id,
          name: a.name,
          courseCode: a.course.courseCode,
          courseName: a.course.courseName,
          dueDate,
          daysOverdue,
          pointsPossible: a.pointsPossible,
          score: ua?.score ?? null,
          status: ua?.status ?? "missing",
          source: a.canvasId
            ? "Canvas"
            : a.gradescopeId
              ? "Gradescope"
              : "Website",
          htmlUrl: a.htmlUrl,
        }
      })
  } catch (error) {
    console.error("[data] getMissingAssignments:", error)
    return []
  }
}

// ── ANNOUNCEMENTS ──────────────────────────────────────────────
export async function getCanvasAnnouncements(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    return await db.canvasAnnouncement.findMany({
      where: { courseId: { in: courseIds } },
      include: {
        course: { select: { courseCode: true } },
      },
      orderBy: { postedAt: "desc" },
      take: 10,
    })
  } catch (error) {
    console.error("[data] getCanvasAnnouncements:", error)
    return []
  }
}

export async function getEdThreads(userId: string, threadType?: 'announcement' | 'question') {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    return await db.edThread.findMany({
      where: {
        courseId: { in: courseIds },
        ...(threadType ? { threadType } : {}),
      },
      include: {
        course: { select: { courseCode: true } },
      },
      orderBy: { postedAt: "desc" },
      take: 30,
    })
  } catch (error) {
    console.error("[data] getEdThreads:", error)
    return []
  }
}

// ── CALENDAR ───────────────────────────────────────────────────
export async function getTodaysEvents(userId: string) {
  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

    return await db.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { startTime: "asc" },
    })
  } catch (error) {
    console.error("[data] getTodaysEvents:", error)
    return []
  }
}

export async function hasCalendarEvents(userId: string): Promise<boolean> {
  try {
    const count = await db.calendarEvent.count({ where: { userId }, take: 1 })
    return count > 0
  } catch {
    return false
  }
}

export async function getWeekCalendarEvents(userId: string, weekOffset = 0) {
  try {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) + weekOffset * 7
    const monday = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return await db.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: monday, lte: sunday },
      },
      orderBy: { startTime: "asc" },
    })
  } catch (error) {
    console.error("[data] getWeekCalendarEvents:", error)
    return []
  }
}

// ── STATS ──────────────────────────────────────────────────────
export async function getDashboardStats(userId: string) {
  try {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    const [dueThisWeek, totalAssignments, missingCount] = await Promise.all([
      db.assignment.count({
        where: {
          courseId: { in: courseIds },
          isCurrentSemester: true,
          dueDate: { gte: now, lte: weekFromNow },
        },
      }),
      db.assignment.count({
        where: {
          courseId: { in: courseIds },
          isCurrentSemester: true,
        },
      }),
      getMissingAssignments(userId).then((m) => m.length),
    ])

    return { dueThisWeek, missingCount, totalAssignments }
  } catch (error) {
    console.error("[data] getDashboardStats:", error)
    return { dueThisWeek: 0, missingCount: 0, totalAssignments: 0 }
  }
}

// ── GRADES ─────────────────────────────────────────────────────
export async function getUserGrades(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map((e) => e.courseId)

    const assignments = await db.assignment.findMany({
      where: {
        courseId: { in: courseIds },
        isCurrentSemester: true,
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
        userAssignments: { where: { userId } },
      },
      orderBy: [{ course: { courseCode: "asc" } }, { dueDate: "asc" }],
    })

    return assignments.map((a) => {
      const ua = a.userAssignments[0]
      return {
        id: a.id,
        name: a.name,
        courseCode: a.course.courseCode,
        courseName: a.course.courseName,
        dueDate: a.dueDate,
        pointsPossible: a.pointsPossible,
        score: ua?.score ?? null,
        status: ua?.status ?? "ungraded",
        isLate: ua?.isLate ?? false,
        source: a.canvasId
          ? "Canvas"
          : a.gradescopeId
            ? "Gradescope"
            : "Website",
      }
    })
  } catch (error) {
    console.error("[data] getUserGrades:", error)
    return []
  }
}

// ── ASSIGNMENT OVERRIDES ──────────────────────────────────────

export async function getUserAssignmentOverrides(userId: string) {
  try {
    return await db.assignmentOverride.findMany({
      where: { userId },
      include: {
        assignment: {
          include: {
            course: { select: { courseCode: true, id: true } }
          }
        }
      }
    });
  } catch (error) {
    console.error('[data] getUserAssignmentOverrides error:', error);
    return [];
  }
}

export async function getCourseAssignmentOverrides(
  userId: string,
  courseId: string
) {
  try {
    return await db.assignmentOverride.findMany({
      where: {
        userId,
        assignment: { courseId }
      },
      include: {
        assignment: { select: { id: true, name: true, pointsPossible: true, dueDate: true } }
      }
    });
  } catch (error) {
    console.error('[data] getCourseAssignmentOverrides error:', error);
    return [];
  }
}

export async function getUserGradesWithOverrides(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            assignments: {
              include: {
                userAssignments: { where: { userId } },
                groupMappings: {
                  include: { componentGroup: true }
                },
                overrides: {
                  where: { userId }
                },
                examStats: true,
              },
              orderBy: { dueDate: 'asc' }
            },
            syllabus: {
              include: {
                componentGroups: true,
                gradeScale: true,
                clobberPolicies: true,
              }
            },
          }
        }
      }
    });
    return enrollments
      .map(e => e.course)
      .filter(c => c.isCurrentSemester);
  } catch (error) {
    console.error('[data] getUserGradesWithOverrides error:', error);
    return [];
  }
}

// ── GRADES PAGE (per-course view) ─────────────────────────────
const BT_SUBJECT_MAP: Record<string, string> = {
  CS: "COMPSCI",
  EECS: "EECS",
  UGBA: "UGBA",
  DATA: "DATA",
  STAT: "STAT",
  MATH: "MATH",
  PHYSICS: "PHYSICS",
  CHEM: "CHEMISTRY",
  MCELLBI: "MCELLBI",
  PSYCH: "PSYCH",
  ECON: "ECON",
}

export function parseCourseCodeForBT(
  courseCode: string
): { subject: string; courseNumber: string } | null {
  const match = courseCode.trim().match(/^([A-Z]+)\s+(\w+)$/)
  if (!match) return null
  const [, dept, num] = match
  return { subject: BT_SUBJECT_MAP[dept] ?? dept, courseNumber: num }
}

export async function getGradesPageData(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            assignments: {
              where: { isCurrentSemester: true },
              include: {
                userAssignments: { where: { userId } },
                overrides: { where: { userId } },
                groupMappings: {
                  include: { componentGroup: true },
                },
              },
              orderBy: { dueDate: "asc" },
            },
          },
        },
      },
    })

    const courses = enrollments
      .map((e) => e.course)
      .filter((c) => c.isCurrentSemester)
      .sort((a, b) => a.courseCode.localeCompare(b.courseCode))

    // Fetch BT snapshots for each course
    const coursesWithBT = await Promise.all(
      courses.map(async (course) => {
        const parsed = parseCourseCodeForBT(course.courseCode)
        const [snapshots, syllabus] = await Promise.all([
          parsed
            ? getBerkeleyTimeSnapshots(parsed.subject, parsed.courseNumber)
            : Promise.resolve([]),
          getSyllabusForCourse(course.id),
        ])
        return {
          id: course.id,
          courseCode: course.courseCode,
          courseName: course.courseName,
          assignments: course.assignments.map((a) => {
            const ua = a.userAssignments[0]
            const override = a.overrides?.[0] ?? null
            const groupMapping = a.groupMappings?.[0] ?? null
            return {
              id: a.id,
              name: a.name,
              dueDate: a.dueDate ? a.dueDate.toISOString() : null,
              pointsPossible: a.pointsPossible,
              score: ua?.score ?? null,
              status: ua?.status ?? "ungraded",
              isLate: ua?.isLate ?? false,
              assignmentType: a.assignmentType ?? null,
              source: a.canvasId
                ? "Canvas"
                : a.gradescopeId
                  ? "Gradescope"
                  : "Website",
              groupName: groupMapping?.componentGroup?.name ?? null,
              override: override
                ? {
                    excludeFromCalc: override.excludeFromCalc,
                    overrideMaxScore: override.overrideMaxScore,
                    overrideDueDate: override.overrideDueDate?.toISOString() ?? null,
                    overrideGroupId: override.overrideGroupId,
                  }
                : null,
            }
          }),
          btSnapshots: snapshots.map((s) => ({
            id: s.id,
            year: s.year,
            semester: s.semester,
            instructor: s.instructor,
            average: s.average,
            pnpPercentage: s.pnpPercentage,
            distribution: s.distribution as { letter: string; percentage: number; count: number }[],
          })),
          syllabus: syllabus
            ? {
                id: syllabus.id,
                isCurved: syllabus.isCurved,
                curveDescription: syllabus.curveDescription,
                confirmedAt: syllabus.confirmedAt?.toISOString() ?? null,
                componentGroups: syllabus.componentGroups.map((g) => ({
                  id: g.id,
                  name: g.name,
                  weight: g.weight,
                  dropLowest: g.dropLowest,
                  isBestOf: g.isBestOf,
                  isExam: g.isExam,
                  assignmentIds: g.assignments.map((m) => m.assignmentId),
                })),
                gradeScale: syllabus.gradeScale.map((gs) => ({
                  letter: gs.letter,
                  minScore: gs.minScore,
                  maxScore: gs.maxScore,
                  isPoints: gs.isPoints,
                })),
                clobberPolicies: syllabus.clobberPolicies.map((p) => ({
                  sourceName: p.sourceName,
                  targetName: p.targetName,
                  comparisonType: p.comparisonType as 'raw' | 'zscore',
                  conditionText: p.conditionText,
                })),
                examStats: syllabus.componentGroups.flatMap((g) =>
                  g.assignments
                    .filter((m) => m.assignment.examStats.length > 0)
                    .map((m) => ({
                      assignmentId: m.assignmentId,
                      mean: m.assignment.examStats[0].mean,
                      stdDev: m.assignment.examStats[0].stdDev,
                      source: m.assignment.examStats[0].source,
                    }))
                ),
              }
            : null,
        }
      })
    )

    return coursesWithBT
  } catch (error) {
    console.error("[data] getGradesPageData:", error)
    return []
  }
}

// ── BERKELEYTIME ──────────────────────────────────────────────
export async function getBerkeleyTimeSnapshots(
  subject: string,
  courseNumber: string
) {
  try {
    const btCourse = await db.berkeleyTimeCourse.findUnique({
      where: { subject_courseNumber: { subject, courseNumber } },
      include: {
        snapshots: {
          orderBy: [{ year: "desc" }, { semester: "asc" }],
        },
      },
    })
    return btCourse?.snapshots ?? []
  } catch (error) {
    console.error("[data] getBerkeleyTimeSnapshots error:", error)
    return []
  }
}

// ── SYLLABUS ──────────────────────────────────────────────────
export async function getSyllabusForCourse(courseId: string) {
  try {
    return await db.syllabus.findUnique({
      where: { courseId },
      include: {
        componentGroups: {
          include: {
            assignments: {
              include: {
                assignment: {
                  include: {
                    userAssignments: true,
                    examStats: true,
                  },
                },
              },
            },
          },
        },
        gradeScale: true,
        clobberPolicies: true,
      },
    })
  } catch (error) {
    console.error('[data] getSyllabusForCourse error:', error)
    return null
  }
}

export async function confirmSyllabus(syllabusId: string, userId: string) {
  try {
    return await db.syllabus.update({
      where: { id: syllabusId },
      data: { confirmedAt: new Date(), confirmedBy: userId },
    })
  } catch (error) {
    console.error('[data] confirmSyllabus error:', error)
    return null
  }
}

export async function upsertExamStatManual(
  assignmentId: string,
  mean: number,
  stdDev: number
) {
  try {
    return await db.examStat.upsert({
      where: { assignmentId_source: { assignmentId, source: 'manual' } },
      create: { assignmentId, mean, stdDev, source: 'manual' },
      update: { mean, stdDev },
    })
  } catch (error) {
    console.error('[data] upsertExamStatManual error:', error)
    return null
  }
}

// ── USER CONNECTION STATUS ─────────────────────────────────────
export async function getUserConnectionStatus(userId: string) {
  try {
    const [tokens, lastSyncs] = await Promise.all([
      db.syncToken.findMany({
        where: { userId },
        select: { service: true, updatedAt: true },
      }),
      db.syncLog.findMany({
        where: { userId, status: "success" },
        orderBy: { completedAt: "desc" },
        take: 10,
        select: { service: true, completedAt: true, recordsCreated: true },
      }),
    ])
    return { tokens, lastSyncs }
  } catch (error) {
    console.error("[data] getUserConnectionStatus:", error)
    return { tokens: [], lastSyncs: [] }
  }
}

// ── TOKEN CHECK ────────────────────────────────────────────────
export async function hasCanvasToken(userId: string): Promise<boolean> {
  try {
    const token = await db.syncToken.findUnique({
      where: { userId_service: { userId, service: "canvas" } },
    })
    return !!token
  } catch {
    return false
  }
}

// ── OFFICE HOURS ────────────────────────────────────────────────
export async function getTodaysOfficeHours(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map(e => e.courseId)
    const todayDow = new Date().getDay() // 0=Sun...6=Sat
    return await db.officeHour.findMany({
      where: {
        courseId: { in: courseIds },
        dayOfWeek: todayDow,
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
      },
      orderBy: { startTime: 'asc' },
    })
  } catch (error) {
    console.error('[data] getTodaysOfficeHours:', error)
    return []
  }
}

// ── EXAMS ────────────────────────────────────────────────────────
export async function getUpcomingExams(userId: string) {
  try {
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })
    const courseIds = enrollments.map(e => e.courseId)
    return await db.exam.findMany({
      where: {
        courseId: { in: courseIds },
        date: { gte: new Date() },
      },
      include: {
        course: { select: { courseCode: true, courseName: true } },
      },
      orderBy: { date: 'asc' },
      take: 5,
    })
  } catch (error) {
    console.error('[data] getUpcomingExams:', error)
    return []
  }
}
