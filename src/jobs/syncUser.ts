import { db } from '../lib/db';
import { runCanvasSync } from '../workers/canvas';
import { runEdSync } from '../workers/ed';
import { runCalendarSync } from '../workers/calendar';
import { runGradescopeSync } from '../workers/gradescope';
import { runCourseWebsiteSync } from '../workers/courseWebsite';
import { syncBerkeleytime } from '../workers/berkeleytime';
import { syncSyllabus } from '../workers/syllabus';
import { assignmentNamesMatch } from '../lib/normalize';
import {
  matchAssignmentsToGroups,
  type AssignmentToMatch,
  type GroupDefinition,
} from '../lib/assignment-matcher';

export async function syncUser(userId: string): Promise<void> {
  console.log(`[syncUser] Starting sync for user ${userId}`);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    console.error(`[syncUser] User ${userId} not found`);
    return;
  }

  // Run Canvas, Ed, Calendar in parallel
  const results = await Promise.allSettled([
    runCanvasSync(userId),
    runEdSync(userId),
    runCalendarSync(userId),
  ]);

  for (const [i, result] of results.entries()) {
    const name = ['Canvas', 'Ed', 'Calendar'][i];
    if (result.status === 'rejected') {
      console.error(`[syncUser] ${name} sync failed:`, result.reason);
    } else {
      console.log(`[syncUser] ${name} sync completed`);
    }
  }

  // Gradescope and course website depend on course list
  try {
    await runGradescopeSync(userId);
    console.log('[syncUser] Gradescope sync completed');
  } catch (err) {
    console.error('[syncUser] Gradescope sync failed:', err);
  }

  try {
    await runCourseWebsiteSync(userId);
    console.log('[syncUser] Course website sync completed');
  } catch (err) {
    console.error('[syncUser] Course website sync failed:', err);
  }

  // Berkeleytime grade distributions
  await syncBerkeleytime(userId).catch((e) =>
    console.error("[BT] Sync failed:", e)
  );

  // Syllabus extraction
  await syncSyllabus(userId).catch((e) =>
    console.error('[syllabus] Sync failed:', e)
  );

  // Enrich assignments with website spec URLs
  try {
    await enrichAssignmentsWithWebsiteData(userId);
    console.log('[syncUser] Assignment enrichment completed');
  } catch (err) {
    console.error('[syncUser] Assignment enrichment failed:', err);
  }

  // Assignment matching — runs LAST after all sources aggregated
  try {
    await runAssignmentMatching(userId);
    console.log('[syncUser] Assignment matching completed');
  } catch (err) {
    console.error('[syncUser] Assignment matching failed:', err);
  }

  // Update last sync timestamp
  await db.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

  // Notify web app to revalidate cached pages for this user
  const webUrl = process.env.WEB_ORIGIN;
  if (webUrl) {
    fetch(`${webUrl}/api/revalidate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
      },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  console.log(`[syncUser] Sync complete for user ${userId}`);
}

async function runAssignmentMatching(userId: string): Promise<void> {
  console.log('[matcher] Running assignment matching...');

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          assignments: {
            select: { id: true, name: true, assignmentType: true },
          },
          syllabus: {
            include: { componentGroups: true },
          },
        },
      },
    },
  });

  for (const enrollment of enrollments) {
    const course = enrollment.course;
    if (!course.isCurrentSemester) continue;
    if (!course.syllabus?.componentGroups?.length) continue;

    const assignments: AssignmentToMatch[] = course.assignments.map((a) => ({
      id: a.id,
      name: a.name,
      assignmentType: a.assignmentType,
    }));

    const groups: GroupDefinition[] = course.syllabus.componentGroups.map(
      (g) => ({
        id: g.id,
        name: g.name,
        weight: g.weight,
        isExam: g.isExam,
      }),
    );

    const results = await matchAssignmentsToGroups(
      assignments,
      groups,
      course.courseCode,
    );

    // Replace auto-generated mappings (user overrides in AssignmentOverride are separate)
    await db.$transaction(async (tx) => {
      await tx.assignmentGroupMapping.deleteMany({
        where: { assignment: { courseId: course.id } },
      });

      const toCreate = results.filter(
        (r) => r.componentGroupId !== null && r.confidence !== 'low',
      );

      if (toCreate.length > 0) {
        await tx.assignmentGroupMapping.createMany({
          data: toCreate.map((r) => ({
            assignmentId: r.assignmentId,
            componentGroupId: r.componentGroupId!,
          })),
          skipDuplicates: true,
        });
      }
    });
  }
}

async function enrichAssignmentsWithWebsiteData(userId: string): Promise<void> {
  const rawWebsiteAssignments = await db.rawCourseWebsiteAssignment.findMany({
    where: { userId },
  });

  if (rawWebsiteAssignments.length === 0) return;

  let enriched = 0;
  let created = 0;
  let skipped = 0;

  // Group by course for efficiency
  const byCourse = rawWebsiteAssignments.reduce((acc, wa) => {
    if (!acc[wa.courseId]) acc[wa.courseId] = [];
    acc[wa.courseId].push(wa);
    return acc;
  }, {} as Record<string, typeof rawWebsiteAssignments>);

  for (const [courseId, websiteAssignments] of Object.entries(byCourse)) {
    // Load all existing unified assignments for this course once
    const existing = await db.assignment.findMany({
      where: { courseId },
    });

    for (const wa of websiteAssignments) {
      // Try to find a matching unified assignment by name
      const match = existing.find(a => assignmentNamesMatch(a.name, wa.name));

      if (match) {
        // Enrich existing assignment with website data
        const updates: Record<string, unknown> = {};
        if (wa.specUrl && !match.specUrl) updates.specUrl = wa.specUrl;
        if (wa.dueDate && !match.dueDate) updates.dueDate = wa.dueDate;

        if (Object.keys(updates).length > 0) {
          await db.assignment.update({
            where: { id: match.id },
            data: updates,
          }).catch(() => {});
          enriched++;
        }
      } else {
        // No match — create a new unified assignment from website data
        // Skip if name is too generic to be useful
        if (!wa.name || wa.name.trim().length < 3) {
          skipped++;
          continue;
        }

        // Derive assignment type
        const nameLower = wa.name.toLowerCase();
        let assignmentType: string = wa.assignmentType ?? 'other';
        if (nameLower.includes('midterm') || nameLower.includes('final') ||
            nameLower.includes('exam') || nameLower.includes('quiz')) {
          assignmentType = 'exam';
        } else if (nameLower.includes('project') || nameLower.includes('lab')) {
          assignmentType = 'project';
        } else if (nameLower.includes('homework') || nameLower.includes('hw') ||
                   nameLower.includes('assignment')) {
          assignmentType = 'homework';
        }

        try {
          const newAssignment = await db.assignment.create({
            data: {
              courseId,
              name: wa.name,
              assignmentType,
              dueDate: wa.dueDate ?? null,
              releaseDate: wa.releaseDate ?? null,
              specUrl: wa.specUrl ?? null,
              source: 'course_website',
              isCurrentSemester: true,
              pointsPossible: null,
              submissionTypes: [],
            },
          });
          created++;

          // Add to existing list so subsequent website assignments
          // in the same course can match against this new record
          existing.push(newAssignment);

          console.log(`[syncUser] Created assignment from website: "${wa.name}" (${courseId})`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          // Unique constraint — already exists under a different name variant
          if (!msg.includes('Unique constraint')) {
            console.error(`[syncUser] Failed to create assignment "${wa.name}":`, msg);
          }
          skipped++;
        }
      }
    }
  }

  console.log(`[syncUser] Website enrichment: ${enriched} enriched, ${created} created, ${skipped} skipped`);
}
