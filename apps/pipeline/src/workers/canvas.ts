import { db } from '../lib/db';
import { decrypt } from '../lib/crypto';
import {
  normalizeCourseCode,
  isNonAcademicCourse,
  parseNextCanvasLink,
  extractSemester,
} from '../lib/normalize';

const BASE_URL = 'https://bcourses.berkeley.edu/api/v1';
const THRESHOLD_MINUTES = 30;

interface CanvasCourseData {
  id: number;
  name: string | null;
  course_code: string | null;
  enrollment_term_id: number | null;
  workflow_state: string | null;
  enrollments: Array<{ enrollment_state: string | null; type: string | null }> | null;
  term?: { start_at: string | null; end_at: string | null } | null;
  html_url: string | null;
}

/**
 * Determine if a course is truly current using Canvas term dates.
 * This replaces the brittle string-matching approach.
 */
function isTrulyCurrentCourse(course: CanvasCourseData, now: Date): boolean {
  // Concluded courses are never current
  if (course.workflow_state === 'concluded') return false;

  // If term end date exists, must not have ended
  if (course.term?.end_at) {
    const termEnd = new Date(course.term.end_at);
    if (termEnd < now) return false;
  }

  // If term start date exists, must have started
  if (course.term?.start_at) {
    const termStart = new Date(course.term.start_at);
    if (termStart > now) return false;
  }

  return true;
}

interface CanvasAssignmentData {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  submission_types: string[] | null;
  html_url: string | null;
}

interface CanvasSubmissionData {
  assignment_id: number;
  workflow_state: string | null;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
}

interface CanvasAnnouncementData {
  id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  html_url: string | null;
}

function deriveStatus(
  submission: CanvasSubmissionData | null,
  dueDate: Date | null
): 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded' {
  if (!submission) {
    if (dueDate && dueDate < new Date()) return 'missing';
    return 'ungraded';
  }
  if (submission.workflow_state === 'graded' || submission.score != null) return 'graded';
  if (submission.workflow_state === 'submitted') return 'submitted';
  if (dueDate && dueDate < new Date() && !submission.submitted_at) return 'missing';
  return 'ungraded';
}

function inferAssignmentType(
  name: string,
  submissionTypes: string[]
): string {
  const lower = name.toLowerCase();
  if (/\bproj(ect)?\b/.test(lower)) return 'project';
  if (/\blab\b/.test(lower)) return 'lab';
  if (/\b(homework|hw|problem\s+set|pset)\b/.test(lower)) return 'homework';
  if (/\b(exam|midterm|final)\b/.test(lower)) return 'exam';
  if (submissionTypes.includes('discussion_topic')) return 'other';
  return 'homework';
}

async function fetchWithRetry(
  url: string,
  token: string,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status !== 429) return res;
    if (attempt === maxRetries) {
      throw new Error(`Canvas API 429 after ${maxRetries} retries on ${url}`);
    }

    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter
      ? parseInt(retryAfter) * 1000
      : Math.pow(2, attempt) * 1000;
    console.warn(`[canvas] 429 rate limited — waiting ${waitMs}ms (attempt ${attempt + 1})`);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  throw new Error('Unreachable');
}

async function fetchPaginated<T>(url: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetchWithRetry(nextUrl, token);

    if (!response.ok) {
      throw new Error(`Canvas API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as T[];
    results.push(...data);

    const linkHeader = response.headers.get('link');
    nextUrl = linkHeader ? parseNextCanvasLink(linkHeader) : null;
  }

  return results;
}

export async function runCanvasSync(userId: string): Promise<void> {
  const syncStart = Date.now();
  console.log(`[canvas] Starting sync for user ${userId}`);

  // Step 1: Load user and token
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const syncToken = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'canvas' } },
  });

  if (!syncToken) {
    console.warn('[canvas] No Canvas token found, skipping');
    return;
  }

  let token: string;
  try {
    token = decrypt(syncToken.accessToken);
  } catch (err) {
    console.error('[canvas] Failed to decrypt token:', err);
    return;
  }
  const now = new Date();

  // Freshness check via SyncMetadata
  const meta = await db.syncMetadata.findUnique({
    where: { userId_source: { userId, source: 'canvas' } },
  });

  if (meta?.lastSynced) {
    const minutesSince =
      (Date.now() - meta.lastSynced.getTime()) / 60000;
    if (minutesSince < THRESHOLD_MINUTES) {
      console.log(
        `[canvas] Skipping — synced ${minutesSince.toFixed(0)}min ago`
      );
      return;
    }
  }

  // Check if initial backfill needed
  const isFirstSync = !(await db.syncLog.findFirst({
    where: { userId, service: 'canvas', isInitialBackfill: true, status: 'success' },
  }));

  // Step 2: Start sync log
  const syncLog = await db.syncLog.create({
    data: {
      userId,
      service: 'canvas',
      status: 'running',
      isInitialBackfill: isFirstSync,
    },
  });

  let recordsFetched = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    // Step 3: Fetch courses
    let courses: CanvasCourseData[];
    try {
      courses = await fetchPaginated<CanvasCourseData>(
        `${BASE_URL}/courses?enrollment_state=active&include[]=enrollments&include[]=term&include[]=teachers&per_page=100`,
        token
      );
      recordsFetched += courses.length;
    } catch (err) {
      console.error('[canvas] Failed to fetch courses, falling back to cached:', err);
      const cached = await db.rawCanvasCourse.findMany({ where: { userId } });
      courses = cached.map(c => c.rawJson as unknown as CanvasCourseData);
    }

    console.log(`[canvas] Fetched ${courses.length} courses in ${Date.now() - syncStart}ms`);

    // Step 5: Process courses
    const currentCourseIds: string[] = [];

    await Promise.allSettled(courses.map(async (course) => {
      if (!course.name || !course.enrollments?.length) return;
      if (isNonAcademicCourse(course.name, course.course_code || '')) return;

      const enrollmentState = course.enrollments[0]?.enrollment_state || 'active';
      const isCurrent = isTrulyCurrentCourse(course, now);
      const canvasCourseId = String(course.id);

      // Upsert RawCanvasCourse
      await db.rawCanvasCourse.upsert({
        where: { userId_canvasCourseId: { userId, canvasCourseId } },
        create: {
          userId,
          canvasCourseId,
          name: course.name,
          courseCode: course.course_code,
          term: extractSemester(course.name, course.course_code || ''),
          enrollmentState,
          canvasUrl: course.html_url,
          isCurrent,
          rawJson: course as any,
        },
        update: {
          name: course.name,
          courseCode: course.course_code,
          enrollmentState,
          isCurrent,
          rawJson: course as any,
          syncedAt: new Date(),
        },
      });

      // Always create Course + Enrollment for active courses (API pre-filtered)
      const normalizedCode = normalizeCourseCode(course.course_code || course.name);
      const term = extractSemester(course.name, course.course_code || '');

      const upsertedCourse = await db.course.upsert({
        where: { courseCode_term: { courseCode: normalizedCode, term } },
        create: {
          courseCode: normalizedCode,
          courseName: course.name,
          term,
          enrollmentState,
          canvasId: canvasCourseId,
          isCurrentSemester: isCurrent,
        },
        update: {
          courseName: course.name,
          enrollmentState,
          canvasId: canvasCourseId,
          isCurrentSemester: isCurrent,
        },
      });

      await db.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: upsertedCourse.id } },
        create: { userId, courseId: upsertedCourse.id, role: 'student' },
        update: {},
      });

      // Populate CourseStaff from Canvas teachers array so BT worker
      // can discover instructors even before the website scraper runs
      const teachers = (course as any).teachers as { display_name?: string }[] | undefined;
      if (teachers?.length) {
        for (const teacher of teachers) {
          if (!teacher.display_name) continue;
          await db.courseStaff.upsert({
            where: {
              courseId_name_role: {
                courseId: upsertedCourse.id,
                name: teacher.display_name,
                role: 'Instructor',
              },
            },
            create: {
              courseId: upsertedCourse.id,
              name: teacher.display_name,
              role: 'Instructor',
            },
            update: {}, // don't overwrite if website scraper already has richer data
          });
        }
      }

      if (isCurrent) currentCourseIds.push(canvasCourseId);
      recordsCreated++;
    }));

    console.log(`[canvas] Processed ${currentCourseIds.length} current courses in ${Date.now() - syncStart}ms`);

    console.log(`[canvas] ${currentCourseIds.length} current courses (from ${courses.length} active enrollments)`);

    // Mark previously-current courses as no longer current
    if (currentCourseIds.length > 0) {
      await db.course.updateMany({
        where: {
          enrollments: { some: { userId } },
          canvasId: { notIn: currentCourseIds },
          isCurrentSemester: true,
        },
        data: { isCurrentSemester: false },
      });
    }

    // Check if user has explicit course selections
    const userSelections = await db.enrollment.findMany({
      where: { userId, userSelected: true },
      include: { course: { select: { canvasId: true } } },
    });

    let courseIdsToSync: string[];
    if (userSelections.length > 0) {
      // Sync ALL user-selected courses, even if they're not in the current semester
      const selectedCanvasIds = userSelections
        .map(e => e.course.canvasId)
        .filter((id): id is string => !!id);
      // Merge: user-selected courses + any current courses not yet selected
      const selectedSet = new Set(selectedCanvasIds);
      courseIdsToSync = [...selectedCanvasIds];
      // Also include current courses that aren't in the selection (e.g. brand new courses)
      for (const id of currentCourseIds) {
        if (!selectedSet.has(id)) courseIdsToSync.push(id);
      }
      console.log(`[canvas] Syncing ${courseIdsToSync.length} courses (${selectedCanvasIds.length} selected + ${courseIdsToSync.length - selectedCanvasIds.length} auto-detected)`);
    } else {
      courseIdsToSync = currentCourseIds;
      console.log(`[canvas] No selections found, syncing ${courseIdsToSync.length} auto-detected courses`);
    }

    // Step 6: Fetch assignments only for selected/current courses
    // Process courses sequentially to avoid Canvas API rate limits (429s)
    // at scale. Inner fetches (assignments + submissions + announcements)
    // run in parallel per course — 3 concurrent requests is fine.
    for (const courseId of courseIdsToSync) {
      try {
        // Fetch assignments, submissions, announcements in parallel
        const [assignmentsData, submissionsData, announcementsData] = await Promise.all([
          fetchPaginated<CanvasAssignmentData>(
            `${BASE_URL}/courses/${courseId}/assignments?per_page=100`, token
          ),
          fetchPaginated<CanvasSubmissionData>(
            `${BASE_URL}/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`, token
          ),
          fetchPaginated<CanvasAnnouncementData>(
            `${BASE_URL}/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`, token
          ),
        ]);

        recordsFetched += assignmentsData.length + submissionsData.length + announcementsData.length;

        // Build submission map
        const submissionMap = new Map<number, CanvasSubmissionData>();
        for (const sub of submissionsData) {
          submissionMap.set(sub.assignment_id, sub);
        }

        // Find the Course record for this canvas course
        const rawCourse = await db.rawCanvasCourse.findUnique({
          where: { userId_canvasCourseId: { userId, canvasCourseId: courseId } },
        });
        const normalizedCode = normalizeCourseCode(rawCourse?.courseCode || rawCourse?.name || '');
        const term = rawCourse?.term || 'UNKNOWN';
        const courseRecord = await db.course.findUnique({
          where: { courseCode_term: { courseCode: normalizedCode, term } },
        });

        // Batch all DB writes into a single transaction
        const txOps: any[] = [];

        for (const assignment of assignmentsData) {
          const canvasAssignmentId = String(assignment.id);
          const dueDate = assignment.due_at ? new Date(assignment.due_at) : null;
          const submission = submissionMap.get(assignment.id) || null;

          // Upsert unified Assignment + UserAssignment if we have a course record
          if (courseRecord) {
            const assignmentId = `canvas_${assignment.id}`;
            txOps.push(db.assignment.upsert({
              where: { id: assignmentId },
              create: {
                id: assignmentId,
                courseId: courseRecord.id,
                name: assignment.name,
                assignmentType: inferAssignmentType(assignment.name, assignment.submission_types || []),
                dueDate,
                pointsPossible: assignment.points_possible,
                submissionTypes: assignment.submission_types || [],
                htmlUrl: assignment.html_url,
                canvasId: canvasAssignmentId,
                isCurrentSemester: courseRecord.isCurrentSemester,
              },
              update: {
                name: assignment.name,
                dueDate,
                pointsPossible: assignment.points_possible,
                htmlUrl: assignment.html_url,
              },
            }));

            const status = deriveStatus(submission, dueDate);
            txOps.push(db.userAssignment.upsert({
              where: { userId_assignmentId: { userId, assignmentId } },
              create: {
                userId,
                assignmentId,
                score: submission?.score ?? null,
                grade: submission?.grade ?? null,
                status,
                submittedAt: submission?.submitted_at ? new Date(submission.submitted_at) : null,
              },
              update: {
                score: submission?.score ?? null,
                grade: submission?.grade ?? null,
                status,
                submittedAt: submission?.submitted_at ? new Date(submission.submitted_at) : null,
              },
            }));
            recordsUpdated++;
          }
        }

        // Process announcements
        for (const ann of announcementsData) {
          const canvasAnnouncementId = String(ann.id);

          if (courseRecord) {
            txOps.push(db.canvasAnnouncement.upsert({
              where: { canvasId: canvasAnnouncementId },
              create: {
                courseId: courseRecord.id,
                canvasId: canvasAnnouncementId,
                title: ann.title,
                message: ann.message,
                postedAt: ann.posted_at ? new Date(ann.posted_at) : null,
                htmlUrl: ann.html_url,
              },
              update: {
                title: ann.title,
                message: ann.message,
                postedAt: ann.posted_at ? new Date(ann.posted_at) : null,
              },
            }));
          }
        }

        // Execute all writes in a single transaction
        if (txOps.length > 0) {
          await db.$transaction(txOps);
        }
      } catch (err) {
        console.error(`[canvas] Failed to sync course ${courseId}:`, err);
      }
    }

    console.log(`[canvas] Fetched + wrote assignments in ${Date.now() - syncStart}ms`);

    // Step 7: Update sync metadata
    await db.syncMetadata.upsert({
      where: { userId_source: { userId, source: 'canvas' } },
      create: { userId, source: 'canvas', lastSynced: new Date(), needsUnification: true, initialBackfillCompleted: isFirstSync },
      update: { lastSynced: new Date(), needsUnification: true, initialBackfillCompleted: true },
    });

    // Step 8: Complete sync log
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        recordsFetched,
        recordsCreated,
        recordsUpdated,
      },
    });

    console.log(`[canvas] Sync complete in ${Date.now() - syncStart}ms: ${recordsFetched} fetched, ${recordsCreated} created, ${recordsUpdated} updated`);

  } catch (err) {
    console.error('[canvas] Sync failed:', err);
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
        recordsFetched,
        recordsCreated,
        recordsUpdated,
      },
    });
    throw err;
  }
}
