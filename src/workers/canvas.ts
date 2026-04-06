import { db } from '../lib/db';
import { decrypt } from '../lib/crypto';
import {
  normalizeCourseCode,
  isNonAcademicCourse,
  isCurrentCourse,
  correctEnrollmentState,
  parseNextCanvasLink,
  extractSemester,
} from '../lib/normalize';

const BASE_URL = 'https://bcourses.berkeley.edu/api/v1';

interface CanvasCourseData {
  id: number;
  name: string | null;
  course_code: string | null;
  enrollment_term_id: number | null;
  enrollments: Array<{ enrollment_state: string | null; type: string | null }> | null;
  html_url: string | null;
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

async function fetchPaginated<T>(url: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });

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
  const currentSemester = user.currentSemester;

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
        `${BASE_URL}/courses?include[]=enrollments&per_page=100`,
        token
      );
      recordsFetched += courses.length;
    } catch (err) {
      console.error('[canvas] Failed to fetch courses, falling back to cached:', err);
      const cached = await db.rawCanvasCourse.findMany({ where: { userId } });
      courses = cached.map(c => c.rawJson as unknown as CanvasCourseData);
    }

    console.log(`[canvas] Fetched ${courses.length} courses in ${Date.now() - syncStart}ms`);

    // Step 4: Write API snapshot
    await db.rawApiSnapshot.upsert({
      where: { userId_service: { userId, service: 'canvas' } },
      create: { userId, service: 'canvas', rawJson: courses as any },
      update: { rawJson: courses as any, syncedAt: new Date() },
    });

    // Step 5: Process courses
    const currentCourseIds: string[] = [];

    await Promise.allSettled(courses.map(async (course) => {
      if (!course.name || !course.enrollments?.length) return;
      if (isNonAcademicCourse(course.name, course.course_code || '')) return;

      const correctedState = correctEnrollmentState(
        course.enrollments[0]?.enrollment_state || null,
        course.name,
        course.course_code || ''
      );

      const isCurrent = isCurrentCourse(
        course.name,
        course.course_code || '',
        currentSemester
      );

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
          enrollmentState: correctedState,
          canvasUrl: course.html_url,
          isCurrent,
          rawJson: course as any,
        },
        update: {
          name: course.name,
          courseCode: course.course_code,
          enrollmentState: correctedState,
          isCurrent,
          rawJson: course as any,
          syncedAt: new Date(),
        },
      });

      if (isCurrent || isFirstSync) {
        const normalizedCode = normalizeCourseCode(course.course_code || course.name);
        const term = extractSemester(course.name, course.course_code || '');

        // Upsert Course (shared)
        const upsertedCourse = await db.course.upsert({
          where: { courseCode_term: { courseCode: normalizedCode, term } },
          create: {
            courseCode: normalizedCode,
            courseName: course.name,
            term,
            enrollmentState: correctedState,
            canvasId: canvasCourseId,
            isCurrentSemester: isCurrent,
          },
          update: {
            courseName: course.name,
            enrollmentState: correctedState,
            canvasId: canvasCourseId,
            isCurrentSemester: isCurrent,
          },
        });

        // Upsert Enrollment
        await db.enrollment.upsert({
          where: { userId_courseId: { userId, courseId: upsertedCourse.id } },
          create: { userId, courseId: upsertedCourse.id, role: 'student' },
          update: {},
        });

        if (isCurrent) currentCourseIds.push(canvasCourseId);
        recordsCreated++;
      }
    }));

    console.log(`[canvas] Processed ${currentCourseIds.length} current courses in ${Date.now() - syncStart}ms`);

    // Step 6: Fetch assignments for courses
    const courseIdsToSync = isFirstSync
      ? courses.filter(c => c.name).map(c => String(c.id))
      : currentCourseIds;

    await Promise.allSettled(courseIdsToSync.map(async (courseId) => {
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

          // Upsert RawCanvasAssignment
          txOps.push(db.rawCanvasAssignment.upsert({
            where: { userId_canvasAssignmentId: { userId, canvasAssignmentId } },
            create: {
              userId,
              canvasAssignmentId,
              canvasCourseId: courseId,
              name: assignment.name,
              dueDate,
              pointsPossible: assignment.points_possible,
              submissionTypes: assignment.submission_types || [],
              htmlUrl: assignment.html_url,
              rawJson: assignment as any,
            },
            update: {
              name: assignment.name,
              dueDate,
              pointsPossible: assignment.points_possible,
              submissionTypes: assignment.submission_types || [],
              htmlUrl: assignment.html_url,
              rawJson: assignment as any,
              syncedAt: new Date(),
            },
          }));

          // Upsert RawCanvasSubmission if exists
          if (submission) {
            txOps.push(db.rawCanvasSubmission.upsert({
              where: { userId_canvasAssignmentId: { userId, canvasAssignmentId } },
              create: {
                userId,
                canvasAssignmentId,
                workflowState: submission.workflow_state,
                score: submission.score,
                grade: submission.grade,
                submittedAt: submission.submitted_at ? new Date(submission.submitted_at) : null,
                rawJson: submission as any,
              },
              update: {
                workflowState: submission.workflow_state,
                score: submission.score,
                grade: submission.grade,
                submittedAt: submission.submitted_at ? new Date(submission.submitted_at) : null,
                rawJson: submission as any,
                syncedAt: new Date(),
              },
            }));
          }

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

          txOps.push(db.rawCanvasAnnouncement.upsert({
            where: { userId_canvasAnnouncementId: { userId, canvasAnnouncementId } },
            create: {
              userId,
              canvasAnnouncementId,
              canvasCourseId: courseId,
              title: ann.title,
              message: ann.message,
              postedAt: ann.posted_at ? new Date(ann.posted_at) : null,
              htmlUrl: ann.html_url,
              rawJson: ann as any,
            },
            update: {
              title: ann.title,
              message: ann.message,
              postedAt: ann.posted_at ? new Date(ann.posted_at) : null,
              rawJson: ann as any,
              syncedAt: new Date(),
            },
          }));

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
    }));

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
