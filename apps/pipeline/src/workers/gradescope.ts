import 'dotenv/config';
import { db } from '../lib/db';
import { decrypt } from '../lib/crypto';
import { isCurrentCourse, assignmentNamesMatch } from '../lib/normalize';
import { filterByUserSelection } from '../lib/enrollment-filter';

const GRADESCOPE_SERVICE_URL =
  process.env.GRADESCOPE_SERVICE_URL ?? 'http://localhost:8001';
const THRESHOLD_HOURS = 6;

interface GradescopeCourse {
  gradescope_id: string;
  short_name: string;
  full_name: string;
  term: string;
  year: string;
  role: string;
}

interface GradescopeAssignment {
  gradescope_id: string;
  title: string;
  release_date: string | null;
  due_date: string | null;
  late_due_date: string | null;
  total_points: number | null;
  earned_points: number | null;
  status: string | null;
  late_info: string | null;
  submitted: boolean;
  url: string | null;
}

async function callService(
  endpoint: string,
  body: Record<string, string>,
): Promise<any> {
  const response = await fetch(`${GRADESCOPE_SERVICE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text();
    // Parse the JSON detail for a cleaner error message
    let message = err;
    try {
      const parsed = JSON.parse(err);
      if (parsed.detail) message = parsed.detail;
    } catch {}
    if (response.status === 401) {
      throw new Error(`Invalid Gradescope credentials — please update your email and password in Settings`);
    }
    throw new Error(`Gradescope sync failed: ${message}`);
  }

  return response.json();
}

function buildTermString(course: GradescopeCourse): string {
  // Combine term + year for semester matching: "Spring 2026"
  return `${course.term} ${course.year}`.trim();
}

export async function runGradescopeSync(userId: string): Promise<void> {
  console.log(`[gradescope] Starting sync for user ${userId}`);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  // Get credentials from SyncToken
  const syncToken = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'gradescope' } },
  });

  if (!syncToken) {
    console.warn('[gradescope] No credentials found, skipping');
    return;
  }

  let email: string;
  let password: string;

  try {
    const tokenValue = decrypt(syncToken.accessToken);
    try {
      const parsed = JSON.parse(tokenValue);
      email = parsed.email;
      password = parsed.password;
    } catch {
      // Fallback: token is just the password, email from env
      email = process.env.GRADESCOPE_EMAIL ?? '';
      password = tokenValue;
    }
  } catch (e) {
    console.error('[gradescope] Failed to decrypt credentials:', e);
    return;
  }

  if (!email || !password) {
    console.warn('[gradescope] Missing email or password, skipping');
    return;
  }

  // Check freshness via SyncMetadata
  const lastSync = await db.syncMetadata.findUnique({
    where: { userId_source: { userId, source: 'gradescope' } },
  });

  if (lastSync?.lastSynced) {
    const hoursSince =
      (Date.now() - lastSync.lastSynced.getTime()) / 3600000;
    if (hoursSince < THRESHOLD_HOURS) {
      console.log(
        `[gradescope] Skipping — synced ${hoursSince.toFixed(1)}h ago`,
      );
      return;
    }
  }

  // Check service health
  try {
    const health = await fetch(`${GRADESCOPE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!health.ok) throw new Error('Service unhealthy');
  } catch {
    console.error(
      '[gradescope] Service not running at',
      GRADESCOPE_SERVICE_URL,
    );
    // Write a failed syncLog so the user sees why it didn't work
    await db.syncLog.create({
      data: {
        userId,
        service: 'gradescope',
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Gradescope sync service is temporarily unavailable. Your data will sync automatically when the service is back online.',
      },
    });
    return;
  }

  const syncLog = await db.syncLog.create({
    data: { userId, service: 'gradescope', status: 'running' },
  });

  let recordsCreated = 0;
  let recordsUpdated = 0;
  const now = new Date();

  try {
    // Fetch all courses
    console.log('[gradescope] Fetching courses...');
    const coursesData = await callService('/courses', { email, password });
    const courses: GradescopeCourse[] = coursesData.courses ?? [];
    console.log(`[gradescope] Found ${courses.length} courses`);

    // Get enrolled DB courses for matching (respect user selection)
    const allEnrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: { id: true, courseCode: true, courseName: true },
        },
      },
    });
    const enrollments = filterByUserSelection(allEnrollments);

    const currentSemester = user.currentSemester ?? 'SP26';

    for (const gsCourse of courses) {
      const termStr = buildTermString(gsCourse);
      const isCurrent = isCurrentCourse(
        `${gsCourse.full_name} ${termStr}`,
        gsCourse.short_name,
        currentSemester,
      );

      // Write raw Gradescope course
      await db.rawGradescopeCourse
        .upsert({
          where: {
            userId_gradescopeId: {
              userId,
              gradescopeId: gsCourse.gradescope_id,
            },
          },
          update: {
            shortName: gsCourse.short_name,
            name: gsCourse.full_name,
            term: termStr,
            role: gsCourse.role,
            rawJson: gsCourse as object,
            syncedAt: now,
          },
          create: {
            userId,
            gradescopeId: gsCourse.gradescope_id,
            shortName: gsCourse.short_name,
            name: gsCourse.full_name,
            term: termStr,
            role: gsCourse.role,
            rawJson: gsCourse as object,
            syncedAt: now,
          },
        })
        .catch((e: any) => {
          console.error('[gradescope] Course upsert error:', e.message);
        });

      // Only sync assignments for current semester
      if (!isCurrent) continue;

      // Match to DB course by code
      const matchedEnrollment = enrollments.find((e: typeof enrollments[number]) => {
        const code = (e.course.courseCode ?? '').toUpperCase();
        const gsShort = gsCourse.short_name.toUpperCase();
        // Direct match: "CS 162" === "CS 162"
        if (code === gsShort) return true;
        // Partial: "CS 189" in "CS 189/289A"
        if (gsShort.includes(code) || code.includes(gsShort.split('/')[0]))
          return true;
        // Number match: extract course numbers
        const codeNum = code.match(/\d+/)?.[0];
        const gsNum = gsShort.match(/\d+/)?.[0];
        if (codeNum && gsNum && codeNum === gsNum) {
          const codeDept = code.replace(/\s*\d+.*/, '');
          const gsDept = gsShort.replace(/\s*\d+.*/, '');
          if (codeDept === gsDept) return true;
        }
        return false;
      });

      if (!matchedEnrollment) {
        console.log(
          `[gradescope] No DB match for: ${gsCourse.short_name}`,
        );
        continue;
      }

      const dbCourseId = matchedEnrollment.course.id;
      console.log(
        `[gradescope] Syncing ${gsCourse.short_name} → ${matchedEnrollment.course.courseCode}`,
      );

      try {
        const assignmentsData = await callService('/assignments', {
          email,
          password,
          course_id: gsCourse.gradescope_id,
        });

        const assignments: GradescopeAssignment[] =
          assignmentsData.assignments ?? [];
        console.log(
          `[gradescope] ${gsCourse.short_name}: ${assignments.length} assignments`,
        );

        // Zero-assignment guard: if we previously had assignments and now see 0,
        // something is wrong with scraping — skip this course to prevent data loss
        const previousCount = await db.userAssignment.count({
          where: {
            userId,
            assignment: { courseId: dbCourseId, source: 'gradescope' },
          },
        });

        if (previousCount > 5 && assignments.length === 0) {
          console.warn(
            `[Gradescope] Zero-assignment guard triggered for course ${dbCourseId}. ` +
            `Previously had ${previousCount}, got 0. Skipping write.`
          );
          await db.syncLog.update({
            where: { id: syncLog.id },
            data: {
              status: 'partial',
              errorMessage: `Gradescope returned 0 assignments for ${gsCourse.short_name} ` +
                `(previously had ${previousCount}). Possible scraping failure. Skipping update.`,
            },
          });
          continue;
        }

        // Get existing unified assignments for matching
        const unifiedAssignments = await db.assignment.findMany({
          where: { courseId: dbCourseId },
          select: { id: true, name: true },
        });

        for (const ga of assignments) {
          // Write raw assignment
          await db.rawGradescopeAssignment
            .upsert({
              where: {
                userId_gradescopeId_courseGradescopeId: {
                  userId,
                  gradescopeId: ga.gradescope_id,
                  courseGradescopeId: gsCourse.gradescope_id,
                },
              },
              update: {
                name: ga.title,
                title: ga.title,
                url: ga.url,
                releaseDate: ga.release_date
                  ? new Date(ga.release_date)
                  : null,
                dueDate: ga.due_date ? new Date(ga.due_date) : null,
                hardDueDate: ga.late_due_date
                  ? new Date(ga.late_due_date)
                  : null,
                totalPoints: ga.total_points,
                earnedPoints: ga.earned_points,
                submitted: ga.submitted,
                submissionState: ga.status,
                status: ga.status,
                lateInfo: ga.late_info,
                rawJson: ga as object,
                syncedAt: now,
              },
              create: {
                userId,
                gradescopeId: ga.gradescope_id,
                courseGradescopeId: gsCourse.gradescope_id,
                name: ga.title,
                title: ga.title,
                url: ga.url,
                releaseDate: ga.release_date
                  ? new Date(ga.release_date)
                  : null,
                dueDate: ga.due_date ? new Date(ga.due_date) : null,
                hardDueDate: ga.late_due_date
                  ? new Date(ga.late_due_date)
                  : null,
                totalPoints: ga.total_points,
                earnedPoints: ga.earned_points,
                submitted: ga.submitted,
                submissionState: ga.status,
                status: ga.status,
                lateInfo: ga.late_info,
                rawJson: ga as object,
                syncedAt: now,
              },
            })
            .catch((e: any) => {
              if (!e.message.includes('Unique')) {
                console.error(
                  '[gradescope] Raw assignment error:',
                  e.message,
                );
              }
            });

          // Try to match to unified assignment by name
          const matched = unifiedAssignments.find((ua: typeof unifiedAssignments[number]) =>
            assignmentNamesMatch(ua.name ?? '', ga.title),
          );

          if (matched) {
            // Update specUrl on the unified assignment if we have a URL
            if (ga.url) {
              await db.assignment
                .update({
                  where: { id: matched.id },
                  data: { specUrl: ga.url },
                })
                .catch(() => {});
            }

            // Determine status
            let status: string;
            if (ga.earned_points !== null) {
              status = 'graded';
            } else if (ga.submitted) {
              status = 'submitted';
            } else {
              status = 'ungraded';
            }

            const isLate = ga.late_info !== null;

            // Upsert UserAssignment
            const existingUA = await db.userAssignment.findUnique({
              where: {
                userId_assignmentId: {
                  userId,
                  assignmentId: matched.id,
                },
              },
            });

            if (existingUA) {
              // Only update if Gradescope has better data
              const shouldUpdate =
                existingUA.status !== 'graded' ||
                (ga.earned_points !== null && existingUA.score === null);

              if (shouldUpdate) {
                await db.userAssignment.update({
                  where: {
                    userId_assignmentId: {
                      userId,
                      assignmentId: matched.id,
                    },
                  },
                  data: {
                    score: ga.earned_points ?? existingUA.score,
                    maxScore: ga.total_points ?? existingUA.maxScore,
                    status,
                    isLate,
                    lateInfo: ga.late_info,
                  },
                });
                recordsUpdated++;
              }
            } else {
              await db.userAssignment
                .create({
                  data: {
                    userId,
                    assignmentId: matched.id,
                    score: ga.earned_points,
                    maxScore: ga.total_points,
                    status,
                    isLate,
                    lateInfo: ga.late_info,
                  },
                })
                .catch(() => {});
              recordsCreated++;
            }
          } else if (ga.title) {
            // Assignment only in Gradescope — create new unified assignment
            const newId = `gs_${ga.gradescope_id}_${dbCourseId}`;
            const newAssignment = await db.assignment
              .upsert({
                where: { id: newId },
                update: {
                  name: ga.title,
                  dueDate: ga.due_date ? new Date(ga.due_date) : null,
                  hardDueDate: ga.late_due_date
                    ? new Date(ga.late_due_date)
                    : null,
                  pointsPossible: ga.total_points,
                  specUrl: ga.url ?? undefined,
                },
                create: {
                  id: newId,
                  courseId: dbCourseId,
                  name: ga.title,
                  assignmentType: 'homework',
                  dueDate: ga.due_date ? new Date(ga.due_date) : null,
                  hardDueDate: ga.late_due_date
                    ? new Date(ga.late_due_date)
                    : null,
                  pointsPossible: ga.total_points,
                  specUrl: ga.url,
                  gradescopeId: ga.gradescope_id,
                  source: 'gradescope',
                  isCurrentSemester: true,
                },
              })
              .catch(() => null);

            if (newAssignment) {
              let status: string;
              if (ga.earned_points !== null) {
                status = 'graded';
              } else if (ga.submitted) {
                status = 'submitted';
              } else {
                status = 'ungraded';
              }

              await db.userAssignment
                .upsert({
                  where: {
                    userId_assignmentId: {
                      userId,
                      assignmentId: newAssignment.id,
                    },
                  },
                  update: {
                    score: ga.earned_points,
                    maxScore: ga.total_points,
                    status,
                    isLate: ga.late_info !== null,
                    lateInfo: ga.late_info,
                  },
                  create: {
                    userId,
                    assignmentId: newAssignment.id,
                    score: ga.earned_points,
                    maxScore: ga.total_points,
                    status,
                    isLate: ga.late_info !== null,
                    lateInfo: ga.late_info,
                  },
                })
                .catch(() => {});
              recordsCreated++;
            }
          }
        }
      } catch (courseError: any) {
        console.error(
          `[gradescope] Failed ${gsCourse.short_name}:`,
          courseError.message,
        );
      }

      // Rate limit: 200ms between courses
      await new Promise((r) => setTimeout(r, 200));
    }

    // Update sync metadata
    await db.syncMetadata.upsert({
      where: { userId_source: { userId, source: 'gradescope' } },
      update: { lastSynced: now, needsUnification: true },
      create: {
        userId,
        source: 'gradescope',
        lastSynced: now,
        needsUnification: true,
      },
    });

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'success',
        completedAt: now,
        recordsCreated,
        recordsUpdated,
      },
    });

    console.log(
      `[gradescope] Sync complete. Created: ${recordsCreated}, Updated: ${recordsUpdated}`,
    );
  } catch (error: any) {
    console.error('[gradescope] Sync failed:', error.message);
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: now,
        errorMessage: error.message,
      },
    });
  }
}
