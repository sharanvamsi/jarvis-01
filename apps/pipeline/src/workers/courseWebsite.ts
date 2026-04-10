// Course website worker — multi-page crawl + Haiku tool_use extraction.
//
// Crawls root URL + same-origin links one level deep, cleans HTML to
// hash-stable markdown, runs 5 split Haiku calls to extract structured
// course data, writes to DB.
//
// Data is course-scoped (global) — one crawl per course serves all users.
// SHA-256 combined content hash prevents unnecessary LLM calls.

import { createHash } from 'node:crypto';
import { db } from '../lib/db';
import type { Prisma } from '@jarvis/db';
import { crawlSite } from '../lib/website-crawler';
import { extractCourseData, type ExtractionResult } from '../lib/course-extractor';

const THRESHOLD_HOURS = 24;
const CURRENT_YEAR = new Date().getFullYear();

function formatTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

async function writeExtractionData(
  courseId: string,
  courseUrl: string,
  extraction: ExtractionResult,
  combinedHash: string,
  now: Date,
): Promise<{ assignments: number; officeHours: number; staff: number; exams: number; syllabusWeeks: number; gradingPolicy: boolean }> {
  // --- Validate assignments ---
  const validAssignments = extraction.assignments.filter((a) => {
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

  const assignmentRows = validAssignments.map((a) => ({
    courseId,
    name: a.name,
    specUrl: a.spec_url,
    dueDate: a.due_date ? new Date(a.due_date) : null,
    releaseDate: a.release_date ? new Date(a.release_date) : null,
    assignmentType: a.type,
    rawJson: a as object,
    syncedAt: now,
  }));

  // --- Validate office hours ---
  const validOH = extraction.office_hours.filter((oh) => {
    if (!oh.staff_name) return false;
    if (oh.day_of_week < 0 || oh.day_of_week > 6) return false;
    if (!oh.start_time || !oh.end_time) return false;
    if (oh.zoom_link && !oh.zoom_link.startsWith('https://')) {
      oh.zoom_link = null;
    }
    return true;
  });

  const officeHourRows = validOH.map((oh) => ({
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

  // --- Validate staff ---
  const validStaff = extraction.staff.filter((s) => !!s.name);
  const staffRows = validStaff.map((s) => ({
    courseId,
    name: s.name,
    role: s.role ?? 'staff',
    email: s.email,
    photoUrl: s.photo_url,
  }));

  // --- Validate exams ---
  const validExams = extraction.exams.filter((e) => !!e.name);
  const examRows = validExams.map((e) => {
    let examDate: Date | null = null;
    if (e.date) {
      try { examDate = new Date(e.date); } catch { examDate = null; }
    }
    return { courseId, name: e.name, date: examDate, location: e.location };
  });

  // --- Validate syllabus weeks ---
  const syllabusWeekRows = extraction.syllabus_weeks
    .filter((w) => w.topic && w.week_num > 0)
    .map((w) => ({
      courseId,
      weekNum: w.week_num,
      topic: w.topic,
      startDate: w.start_date ? new Date(w.start_date) : null,
      readings: w.readings,
    }));

  // --- Grading policy ---
  const gp = extraction.grading_policy;

  // Check if grading is already user-confirmed — don't overwrite manual/confirmed weights
  const existingSyllabus = await db.syllabus.findUnique({
    where: { courseId },
    select: { confirmedAt: true },
  });
  const gradingConfirmed = !!existingSyllabus?.confirmedAt;

  // --- Atomic transaction ---
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Delete + recreate course website data
    await tx.rawCourseWebsiteAssignment.deleteMany({ where: { courseId } });
    await tx.officeHour.deleteMany({ where: { courseId } });
    await tx.courseStaff.deleteMany({ where: { courseId } });
    await tx.exam.deleteMany({ where: { courseId } });
    await tx.syllabusWeek.deleteMany({ where: { courseId } });

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
    if (syllabusWeekRows.length > 0) {
      await tx.syllabusWeek.createMany({ data: syllabusWeekRows, skipDuplicates: true });
    }

    // Write grading policy to Syllabus tables (skip if user already confirmed)
    if (gp && !gradingConfirmed) {
      const syllabus = await tx.syllabus.upsert({
        where: { courseId },
        create: {
          courseId,
          isCurved: gp.is_curved,
          curveDescription: gp.curve_description,
          isPointsBased: gp.is_points_based,
          totalPoints: gp.total_points,
        },
        update: {
          isCurved: gp.is_curved,
          curveDescription: gp.curve_description,
          isPointsBased: gp.is_points_based,
          totalPoints: gp.total_points,
          extractedAt: now,
          confirmedAt: null,
          confirmedBy: null,
        },
      });

      await tx.syllabusDocument.upsert({
        where: { syllabusId: syllabus.id },
        create: {
          syllabusId: syllabus.id,
          source: 'website',
          sourceUrl: courseUrl,
          rawText: '',
          contentHash: combinedHash,
        },
        update: {
          source: 'website',
          sourceUrl: courseUrl,
          contentHash: combinedHash,
          fetchedAt: now,
        },
      });

      // Recreate component groups, grade scale, clobber policies
      await tx.componentGroup.deleteMany({ where: { syllabusId: syllabus.id } });
      await tx.gradeScale.deleteMany({ where: { syllabusId: syllabus.id } });
      await tx.clobberPolicy.deleteMany({ where: { syllabusId: syllabus.id } });

      for (const group of gp.component_groups) {
        await tx.componentGroup.create({
          data: {
            syllabusId: syllabus.id,
            name: group.name,
            weight: group.weight,
            dropLowest: group.drop_lowest,
            isBestOf: group.is_best_of,
            isExam: group.is_exam,
          },
        });
      }

      if (gp.grade_scale) {
        await tx.gradeScale.createMany({
          data: gp.grade_scale.map((gs) => ({
            syllabusId: syllabus.id,
            letter: gs.letter,
            minScore: gs.min_score,
            maxScore: gs.max_score,
            isPoints: gs.is_points,
          })),
        });
      }

      // Create clobber policies and resolve FK references
      const createdPolicies = [];
      for (const policy of gp.clobber_policies) {
        const created = await tx.clobberPolicy.create({
          data: {
            syllabusId: syllabus.id,
            sourceName: policy.source_name,
            targetName: policy.target_name,
            comparisonType: policy.comparison_type,
            conditionText: policy.condition_text,
          },
        });
        createdPolicies.push(created);
      }

      if (createdPolicies.length > 0) {
        const createdGroups = await tx.componentGroup.findMany({
          where: { syllabusId: syllabus.id },
          select: { id: true, name: true },
        });
        const groupByName = Object.fromEntries(
          createdGroups.map((g) => [g.name.toLowerCase().trim(), g.id]),
        );
        for (const policy of createdPolicies) {
          const sourceId = groupByName[policy.sourceName.toLowerCase().trim()];
          const targetId = groupByName[policy.targetName.toLowerCase().trim()];
          if (sourceId && targetId) {
            await tx.clobberPolicy.update({
              where: { id: policy.id },
              data: { sourceGroupId: sourceId, targetGroupId: targetId },
            });
          }
        }
      }
    }
  });

  return {
    assignments: assignmentRows.length,
    officeHours: officeHourRows.length,
    staff: staffRows.length,
    exams: examRows.length,
    syllabusWeeks: syllabusWeekRows.length,
    gradingPolicy: !!gp && !gradingConfirmed,
  };
}

export async function runCourseWebsiteSync(userId: string): Promise<void> {
  console.log(`[website] Starting sync for user ${userId}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[website] ANTHROPIC_API_KEY not set, skipping');
    return;
  }

  // Get all enrolled courses with website URLs (no user-selection filter — data is global)
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        select: { id: true, courseCode: true, websiteUrl: true },
      },
    },
  });

  const coursesToSync = enrollments
    .map((e) => e.course)
    .filter((c) => !!c.websiteUrl);

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

      // Crawl the website (multi-page)
      const { results: crawled, summary } = await crawlSite(url);

      console.log(
        `[website] ${code}: crawled ${summary.total} pages — ` +
          `${summary.ok} ok, ${summary.failed} failed, ` +
          `${summary.jsShellSuspected} js-shell, ${summary.authWalled} auth-walled`,
      );

      // Skip LLM if combined content hash unchanged
      if (existing?.contentHash === summary.combinedContentHash) {
        console.log(`[website] ${code}: content unchanged, skipping LLM`);
        await db.rawCourseWebsitePageHash.update({
          where: { courseId: course.id },
          data: { lastChecked: now },
        });
        continue;
      }

      // Filter to extractable pages
      const extractablePages = crawled
        .filter((c) => c.status === 'ok' || c.status === 'js-shell-suspected')
        .filter((c) => c.markdown.length > 0)
        .map((c) => ({ url: c.url, markdown: c.markdown }));

      if (extractablePages.length === 0) {
        console.warn(`[website] ${code}: no extractable pages, skipping LLM`);
        await db.rawCourseWebsitePageHash.upsert({
          where: { courseId: course.id },
          update: { contentHash: summary.combinedContentHash, lastChecked: now, lastChanged: now },
          create: { courseId: course.id, contentHash: summary.combinedContentHash, lastChecked: now, lastChanged: now },
        });
        continue;
      }

      // Extract with Haiku
      console.log(`[website] ${code}: content changed, extracting with LLM (${extractablePages.length} pages)...`);
      const extraction = await extractCourseData(extractablePages, url);

      console.log(
        `[website] ${code}: extracted — ` +
          `${extraction.assignments.length} assignments, ` +
          `${extraction.office_hours.length} OH, ` +
          `${extraction.staff.length} staff, ` +
          `${extraction.exams.length} exams, ` +
          `${extraction.syllabus_weeks.length} syllabus weeks` +
          `${extraction.grading_policy ? ', grading policy' : ''}` +
          ` ($${extraction.extraction_meta.total_cost_usd.toFixed(4)})`,
      );

      // Write to DB
      const counts = await writeExtractionData(
        course.id, url, extraction, summary.combinedContentHash, now,
      );
      totalCreated += counts.assignments + counts.officeHours + counts.staff +
        counts.exams + counts.syllabusWeeks;

      // Update page hash
      await db.rawCourseWebsitePageHash.upsert({
        where: { courseId: course.id },
        update: { contentHash: summary.combinedContentHash, lastChecked: now, lastChanged: now },
        create: { courseId: course.id, contentHash: summary.combinedContentHash, lastChecked: now, lastChanged: now },
      });

      console.log(
        `[website] ${code}: done — ` +
          `${counts.assignments} assignments, ${counts.officeHours} OH, ` +
          `${counts.staff} staff, ${counts.exams} exams, ` +
          `${counts.syllabusWeeks} syllabus weeks` +
          `${counts.gradingPolicy ? ', grading policy' : ''}`,
      );

      // Delay between courses
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[website] ${code} failed:`, msg);
      failedCourses.push(code);
    }
  }

  await db.syncLog.updateMany({
    where: { id: syncLog.id },
    data: {
      status: failedCourses.length > 0 ? 'partial' : 'success',
      completedAt: new Date(),
      recordsCreated: totalCreated,
      errorMessage: failedCourses.length > 0 ? `Failed: ${failedCourses.join(', ')}` : null,
    },
  });

  console.log(`[website] Sync complete. Total records: ${totalCreated}`);
}
