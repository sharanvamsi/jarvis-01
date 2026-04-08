// Course website scraper uses Claude Haiku for LLM extraction
// Extracts: assignments, office hours, staff, exams, syllabus weeks
// SHA-256 content hash prevents unnecessary LLM calls

import { createHash } from 'crypto';
import { db } from '../lib/db';
import type { Prisma } from '@jarvis/db';
import { filterByUserSelection } from '../lib/enrollment-filter';

const THRESHOLD_HOURS = 24;
const LLM_MODEL = 'claude-haiku-4-5-20251001';
const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES = 3;
const CURRENT_YEAR = new Date().getFullYear();
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Known course website URLs
const KNOWN_URLS: Record<string, string> = {
  'CS 162': 'https://cs162.org',
  'CS 189': 'https://eecs189.org/sp26',
};

interface ScrapedAssignment {
  name: string;
  type: 'homework' | 'project' | 'lab' | 'exam' | 'other';
  due_date: string | null;
  release_date: string | null;
  spec_url: string | null;
}

interface ScrapedOfficeHour {
  staff_name: string;
  staff_role: 'professor' | 'ta' | 'tutor' | 'other';
  day_of_week: number; // 0=Sun, 1=Mon...6=Sat
  start_time: string;  // "14:00"
  end_time: string;    // "16:00"
  location: string | null;
  zoom_link: string | null;
}

interface ScrapedStaff {
  name: string;
  role: string;
  email: string | null;
  photo_url: string | null;
}

interface ScrapedExam {
  name: string;
  date: string | null;    // "YYYY-MM-DD"
  time: string | null;    // "7:00 PM - 9:00 PM"
  location: string | null;
}

interface ScrapedSyllabusWeek {
  week_num: number;
  topic: string;
  start_date: string | null;
  readings: string | null;
}

interface ScrapedCourseData {
  assignments: ScrapedAssignment[];
  office_hours: ScrapedOfficeHour[];
  staff: ScrapedStaff[];
  exams: ScrapedExam[];
  syllabus_weeks: ScrapedSyllabusWeek[];
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fetchWithRetry(
  url: string,
  retries = FETCH_RETRIES
): Promise<string> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      lastError = err as Error;
      console.warn(`[website] Fetch attempt ${i + 1} failed: ${lastError.message}`);
    }
  }
  throw lastError ?? new Error('Fetch failed');
}

function filterHtmlToMarkdown(html: string): string {
  let filtered = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

  // Convert common elements to text, preserving links
  filtered = filtered
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  return filtered.slice(0, 12000);
}

async function extractWithLLM(
  courseCode: string,
  courseUrl: string,
  markdown: string
): Promise<ScrapedCourseData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const systemPrompt = `You are extracting structured course data from a Berkeley course website.
Return ONLY a valid JSON object with NO preamble, NO markdown, NO backticks.
The JSON must have these exact keys:
{
  "assignments": [...],
  "office_hours": [...],
  "staff": [...],
  "exams": [...],
  "syllabus_weeks": [...]
}

For assignments: { name, type (homework/project/lab/exam/other), due_date (YYYY-MM-DD or null), release_date (YYYY-MM-DD or null), spec_url (full https:// URL or null) }
Only include assignments for year ${CURRENT_YEAR}. Reject dates from other years.
If spec_url is a relative path, prepend the base URL: ${courseUrl}

For office_hours: { staff_name, staff_role (professor/ta/tutor/other), day_of_week (0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat), start_time ("HH:MM" 24hr), end_time ("HH:MM" 24hr), location (room or null), zoom_link (https:// or null) }

For staff: { name, role, email (or null), photo_url (full https:// URL or null) }

For exams: { name, date (YYYY-MM-DD or null), time ("H:MM PM - H:MM PM" or null), location (or null) }

For syllabus_weeks: { week_num (integer), topic, start_date (YYYY-MM-DD or null), readings (or null) }

If you cannot find data for a category, return an empty array for it.
Only return the JSON object, nothing else.`;

  const userMessage = `Extract all course data from this ${courseCode} website (${courseUrl}):\n\n${markdown}`;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  const text = data.content?.[0]?.text ?? '';

  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as ScrapedCourseData;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as ScrapedCourseData;
    }
    console.error('[website] Failed to parse LLM response:', text.slice(0, 200));
    return {
      assignments: [], office_hours: [], staff: [],
      exams: [], syllabus_weeks: [],
    };
  }
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

async function writeScrapedData(
  userId: string,
  courseId: string,
  courseCode: string,
  data: ScrapedCourseData,
  now: Date
): Promise<{ assignments: number; officeHours: number; staff: number; exams: number; syllabusWeeks: number }> {
  // --- Validate and prepare all data before the transaction ---

  // ASSIGNMENTS
  const validAssignments = data.assignments.filter(a => {
    if (!a.name) return false;
    if (a.due_date) {
      const year = parseInt(a.due_date.split('-')[0]);
      if (year !== CURRENT_YEAR) return false;
    }
    if (a.spec_url && !a.spec_url.startsWith('https://')) {
      a.spec_url = null;
    }
    if (!['homework', 'project', 'lab', 'exam', 'other'].includes(a.type)) {
      a.type = 'other';
    }
    return true;
  });

  const assignmentRows = validAssignments.map(a => ({
    userId,
    courseId,
    courseName: courseCode,
    name: a.name,
    specUrl: a.spec_url,
    dueDate: a.due_date ? new Date(a.due_date) : null,
    releaseDate: a.release_date ? new Date(a.release_date) : null,
    assignmentType: a.type,
    rawJson: a as object,
    syncedAt: now,
  }));

  // OFFICE HOURS
  const validOH = data.office_hours.filter(oh => {
    if (!oh.staff_name) return false;
    if (oh.day_of_week < 0 || oh.day_of_week > 6) return false;
    if (!oh.start_time || !oh.end_time) return false;
    if (oh.zoom_link && !oh.zoom_link.startsWith('https://')) {
      oh.zoom_link = null;
    }
    return true;
  });

  const officeHourRows = validOH.map(oh => ({
    courseId,
    staffName: oh.staff_name,
    staffRole: oh.staff_role,
    dayOfWeek: oh.day_of_week,
    startTime: formatTime(oh.start_time),
    endTime: formatTime(oh.end_time),
    location: oh.location,
    zoomLink: oh.zoom_link,
    isRecurring: true,
  }));

  // STAFF
  const validStaff = data.staff.filter(s => !!s.name);

  const staffRows = validStaff.map(s => ({
    courseId,
    name: s.name,
    role: s.role ?? 'staff',
    email: s.email,
    photoUrl: s.photo_url,
  }));

  // EXAMS
  const validExams = data.exams.filter(e => !!e.name);

  const examRows = validExams.map(e => {
    let examDate: Date | null = null;
    if (e.date) {
      try { examDate = new Date(e.date); } catch { examDate = null; }
    }
    return {
      courseId,
      name: e.name,
      date: examDate,
      location: e.location,
    };
  });

  // --- Atomic transaction: delete all then createMany ---
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Delete all existing data for this course/user
    await tx.rawCourseWebsiteAssignment.deleteMany({ where: { userId, courseId } });
    await tx.officeHour.deleteMany({ where: { courseId } });
    await tx.courseStaff.deleteMany({ where: { courseId } });
    await tx.exam.deleteMany({ where: { courseId } });
    // Bulk insert all new data
    if (assignmentRows.length > 0) {
      await tx.rawCourseWebsiteAssignment.createMany({ data: assignmentRows, skipDuplicates: true });
    }
    if (officeHourRows.length > 0) {
      await tx.officeHour.createMany({ data: officeHourRows });
    }
    if (staffRows.length > 0) {
      await tx.courseStaff.createMany({ data: staffRows });
    }
    if (examRows.length > 0) {
      await tx.exam.createMany({ data: examRows });
    }
  });

  return {
    assignments: assignmentRows.length,
    officeHours: officeHourRows.length,
    staff: staffRows.length,
    exams: examRows.length,
    syllabusWeeks: 0,
  };
}

export async function runCourseWebsiteSync(userId: string): Promise<void> {
  console.log(`[website] Starting sync for user ${userId}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[website] ANTHROPIC_API_KEY not set, skipping');
    return;
  }

  // Get enrolled courses with website URLs (respect user selection)
  const allEnrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        select: {
          id: true,
          courseCode: true,
          websiteUrl: true,
        },
      },
    },
  });

  const enrollments = filterByUserSelection(allEnrollments);
  const coursesToSync = enrollments
    .map((e: typeof enrollments[number]) => e.course)
    .filter((c: { id: string; courseCode: string | null; websiteUrl: string | null }) => {
      const url = c.websiteUrl ?? KNOWN_URLS[c.courseCode ?? ''];
      return !!url;
    })
    .map((c: { id: string; courseCode: string | null; websiteUrl: string | null }) => ({
      ...c,
      websiteUrl: c.websiteUrl ?? KNOWN_URLS[c.courseCode ?? ''] ?? null,
    }));

  // Update course URLs in DB if missing
  for (const c of coursesToSync) {
    const knownUrl = KNOWN_URLS[c.courseCode ?? ''];
    if (knownUrl && !c.websiteUrl) {
      await db.course.update({
        where: { id: c.id },
        data: { websiteUrl: knownUrl },
      }).catch(() => {});
    }
  }

  console.log(`[website] Found ${coursesToSync.length} courses with websites`);

  const syncLog = await db.syncLog.create({
    data: {
      userId,
      service: 'course_website',
      status: 'running',
      startedAt: new Date(),
    },
  });

  let totalCreated = 0;
  const failedCourses: string[] = [];
  const now = new Date();

  for (const course of coursesToSync) {
    const url = course.websiteUrl!;
    const code = course.courseCode ?? 'Unknown';
    console.log(`[website] Processing ${code}: ${url}`);

    try {
      // Check page hash for changes (course-scoped)
      const existing = await db.rawCourseWebsitePageHash.findUnique({
        where: { courseId: course.id },
      });

      if (existing?.lastChecked) {
        const hoursSince = (now.getTime() - existing.lastChecked.getTime()) / 3600000;
        if (hoursSince < THRESHOLD_HOURS && existing.contentHash) {
          console.log(`[website] ${code}: checked ${hoursSince.toFixed(0)}h ago, skipping`);
          continue;
        }
      }

      // Fetch the website
      const html = await fetchWithRetry(url);
      const markdown = filterHtmlToMarkdown(html);
      const contentHash = hashContent(markdown);

      // Skip LLM if content unchanged
      if (existing?.contentHash === contentHash) {
        console.log(`[website] ${code}: content unchanged, skipping LLM`);
        await db.rawCourseWebsitePageHash.update({
          where: { courseId: course.id },
          data: { lastChecked: now },
        });
        continue;
      }

      console.log(`[website] ${code}: content changed, extracting with LLM...`);

      // Extract with Claude Haiku
      const scraped = await extractWithLLM(code, url, markdown);

      console.log(
        `[website] ${code}: extracted - ` +
        `${scraped.assignments.length} assignments, ` +
        `${scraped.office_hours.length} OH slots, ` +
        `${scraped.staff.length} staff, ` +
        `${scraped.exams.length} exams, ` +
        `${scraped.syllabus_weeks.length} syllabus weeks`
      );

      // Write to DB
      const counts = await writeScrapedData(userId, course.id, code, scraped, now);
      totalCreated += Object.values(counts).reduce((a, b) => a + b, 0);

      // Update page hash
      await db.rawCourseWebsitePageHash.upsert({
        where: { courseId: course.id },
        update: {
          contentHash,
          lastChecked: now,
          lastChanged: now,
        },
        create: {
          courseId: course.id,
          contentHash,
          lastChecked: now,
          lastChanged: now,
        },
      });

      console.log(
        `[website] ${code}: done - ` +
        `${counts.assignments} assignments, ` +
        `${counts.officeHours} OH, ${counts.staff} staff, ` +
        `${counts.exams} exams, ${counts.syllabusWeeks} syllabus weeks`
      );

      // Delay between courses
      await new Promise(r => setTimeout(r, 500));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[website] ${code} failed:`, msg);
      failedCourses.push(code);
    }
  }

  await db.syncLog.update({
    where: { id: syncLog.id },
    data: {
      status: failedCourses.length > 0 ? 'partial' : 'success',
      completedAt: now,
      recordsCreated: totalCreated,
      errorMessage: failedCourses.length > 0 ? `Failed: ${failedCourses.join(', ')}` : null,
    },
  });

  console.log(`[website] Sync complete. Total records: ${totalCreated}`);
}
