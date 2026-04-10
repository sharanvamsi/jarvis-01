import { db } from '../lib/db';
import { decrypt } from '../lib/crypto';
import { filterByUserSelection } from '../lib/enrollment-filter';

const BASE_URL = 'https://us.edstem.org/api';
const THRESHOLD_MINUTES = 15;
const LINKED_ASSIGNMENT_REGEX =
  /(?:hw|homework|project|proj|lab)\s*[\w:-]+|midterm\s*\d*|final(?:\s+exam)?/gi;

interface EdThreadData {
  id: number;
  title: string;
  category: string;
  type: string;
  is_announcement: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  document: string;
  vote_count: number;
  is_answered: boolean;
  answer_count?: number;
  url?: string;
  user?: { role?: string; course_role?: string };
  answers?: Array<{
    user_role?: string;
    role?: string;
    user?: { role?: string; course_role?: string };
  }>;
}

interface EdThreadsResponse {
  threads: EdThreadData[];
}

function classifyThread(
  thread: EdThreadData
): 'announcement' | 'question' | 'ignore' {
  if (thread.type === 'announcement') return 'announcement';
  if (thread.is_announcement) return 'announcement';
  if (thread.is_pinned) {
    const role =
      thread.user?.role ?? thread.user?.course_role ?? '';
    if (['admin', 'staff', 'instructor', 'ta'].includes(role)) {
      return 'announcement';
    }
  }

  const answerCount =
    thread.answer_count ?? thread.answers?.length ?? 0;
  if (answerCount > 3) return 'question';
  if (thread.vote_count > 5) return 'question';
  if (thread.is_answered && thread.vote_count > 2) return 'question';

  return 'ignore';
}

function extractContentPreview(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function extractLinkedAssignment(
  title: string,
  content: string
): string | null {
  const combined = `${title} ${content}`;
  const regex = new RegExp(LINKED_ASSIGNMENT_REGEX.source, 'gi');
  const match = combined.match(regex);
  return match ? match[0].trim() : null;
}

async function fetchEdThreads(
  courseId: number,
  token: string
): Promise<EdThreadData[]> {
  const allThreads: EdThreadData[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url =
      `${BASE_URL}/courses/${courseId}/threads` +
      `?limit=${limit}&offset=${offset}&sort=new`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (response.status === 401) {
      throw new Error(
        'Invalid Ed token — regenerate at edstem.org/us/settings/api-tokens'
      );
    }
    if (response.status === 403) {
      throw new Error(
        `Access denied for Ed course ${courseId} — check enrollment`
      );
    }
    if (!response.ok) {
      throw new Error(
        `Ed API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as EdThreadsResponse;
    const batch = data.threads ?? [];
    allThreads.push(...batch);

    if (batch.length < limit) break;
    offset += limit;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return allThreads;
}

export async function runEdSync(userId: string): Promise<void> {
  console.log(`[ed] Starting sync for user ${userId}`);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const syncToken = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'ed' } },
  });
  if (!syncToken) {
    console.warn('[ed] No Ed token found, skipping');
    return;
  }

  let token: string;
  try {
    token = decrypt(syncToken.accessToken);
  } catch (e) {
    console.error('[ed] Failed to decrypt token:', e);
    return;
  }

  // Freshness check via SyncMetadata
  const meta = await db.syncMetadata.findUnique({
    where: { userId_source: { userId, source: 'ed' } },
  });

  if (meta?.lastSynced) {
    const minutesSince =
      (Date.now() - meta.lastSynced.getTime()) / 60000;
    if (minutesSince < THRESHOLD_MINUTES) {
      console.log(
        `[ed] Skipping — synced ${minutesSince.toFixed(0)}min ago`
      );
      return;
    }
  }

  // Create sync log entry
  const syncLog = await db.syncLog.create({
    data: {
      userId,
      service: 'ed',
      status: 'running',
      startedAt: new Date(),
    },
  });

  let recordsFetched = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;
  const failedCourses: string[] = [];

  try {
    // Get enrolled courses with Ed configured
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true,
            courseCode: true,
            courseName: true,
            edCourseId: true,
          },
        },
      },
    });

    const filteredEnrollments = filterByUserSelection(enrollments);
    const edCourses = filteredEnrollments
      .map((e) => e.course)
      .filter((c) => c.edCourseId !== null);

    console.log(
      `[ed] Found ${edCourses.length} courses with Ed configured`
    );

    if (edCourses.length === 0) {
      console.warn('[ed] No courses have edCourseId set');
    }

    for (const course of edCourses) {
      const edCourseId = course.edCourseId!;
      const edCourseIdNum = parseInt(edCourseId);
      console.log(
        `[ed] Fetching threads for ${course.courseCode} (Ed course ${edCourseId})`
      );

      try {
        const threads = await fetchEdThreads(edCourseIdNum, token);
        console.log(
          `[ed] ${course.courseCode}: ${threads.length} threads fetched`
        );
        recordsFetched += threads.length;

        for (const thread of threads) {
          const edThreadId = `ed_${edCourseId}_${thread.id}`;
          const threadUrl =
            `https://edstem.org/us/courses/${edCourseId}` +
            `/discussion/${thread.id}`;
          const contentPreview = extractContentPreview(
            thread.document ?? ''
          );
          const linkedAssignment = extractLinkedAssignment(
            thread.title,
            contentPreview
          );
          const threadType = classifyThread(thread);
          const answerCount =
            thread.answer_count ?? thread.answers?.length ?? 0;

          // Write to unified EdThread if announcement or question
          if (threadType !== 'ignore') {
            const existing = await db.edThread.findUnique({
              where: { edThreadId },
            });

            if (existing) {
              await db.edThread.update({
                where: { edThreadId },
                data: {
                  title: thread.title,
                  category: thread.category ?? null,
                  contentPreview,
                  threadType,
                  isAnnouncement: thread.is_announcement,
                  isPinned: thread.is_pinned,
                  linkedAssignment,
                  answerCount,
                  voteCount: thread.vote_count,
                  isAnswered: thread.is_answered,
                  url: threadUrl,
                },
              });
              recordsUpdated++;
            } else {
              await db.edThread.create({
                data: {
                  edThreadId,
                  courseId: course.id,
                  title: thread.title,
                  category: thread.category ?? null,
                  contentPreview,
                  threadType,
                  isAnnouncement: thread.is_announcement,
                  isPinned: thread.is_pinned,
                  linkedAssignment,
                  answerCount,
                  voteCount: thread.vote_count,
                  isAnswered: thread.is_answered,
                  url: threadUrl,
                  postedAt: new Date(thread.created_at),
                },
              });
              recordsCreated++;
            }
          }
        }

        console.log(
          `[ed] ${course.courseCode}: done. ` +
            `${recordsCreated} created, ${recordsUpdated} updated`
        );
      } catch (courseError: any) {
        console.error(
          `[ed] Failed to sync ${course.courseCode}:`,
          courseError.message
        );
        failedCourses.push(course.courseCode ?? '');
      }
    }

    // Update sync log
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: failedCourses.length > 0 ? 'partial' : 'success',
        completedAt: new Date(),
        recordsFetched,
        recordsCreated,
        recordsUpdated,
        errorMessage:
          failedCourses.length > 0
            ? `Failed courses: ${failedCourses.join(', ')}`
            : null,
      },
    });

    // Update sync metadata
    await db.syncMetadata.upsert({
      where: { userId_source: { userId, source: 'ed' } },
      update: {
        lastSynced: new Date(),
        needsUnification: true,
      },
      create: {
        userId,
        source: 'ed',
        lastSynced: new Date(),
        needsUnification: true,
      },
    });

    console.log(
      `[ed] Sync complete. Fetched: ${recordsFetched}, ` +
        `Created: ${recordsCreated}, Updated: ${recordsUpdated}`
    );
  } catch (error: any) {
    console.error('[ed] Sync failed:', error.message);
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });
    throw error;
  }
}

