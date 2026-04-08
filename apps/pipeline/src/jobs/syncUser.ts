import { createHash } from 'node:crypto';
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
  const t = Date.now();
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

  console.log(`[syncUser] Phase 1 complete in ${Date.now() - t}ms`);

  // Update last sync and revalidate immediately so dashboard shows data
  await db.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

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

  // ── Phase 2: Slow enrichment (background, non-blocking) ───
  runPhase2(userId, t, webUrl).catch(err =>
    console.error('[syncUser] Phase 2 error:', err)
  );

  console.log(`[syncUser] Returning after Phase 1 for user ${userId}`);
}

async function runPhase2(userId: string, startTime: number, webUrl: string | undefined): Promise<void> {
  // ── Phase 2a: independent fetchers ─────────────────────────────
  console.log('[syncUser] Phase 2a starting (parallel: Gradescope + Website)');
  const [gradescopeResult, websiteResult] = await Promise.allSettled([
    runGradescopeSync(userId),
    runCourseWebsiteSync(userId),
  ]);

  if (gradescopeResult.status === 'rejected') {
    console.error('[Phase 2a] Gradescope failed:', gradescopeResult.reason);
  } else {
    console.log(`[syncUser] Gradescope sync completed (${Date.now() - startTime}ms)`);
  }
  if (websiteResult.status === 'rejected') {
    console.error('[Phase 2a] Website failed:', websiteResult.reason);
  } else {
    console.log(`[syncUser] Course website sync completed (${Date.now() - startTime}ms)`);
  }

  // Enrichment depends on website data being present
  try {
    await enrichAssignmentsWithWebsiteData(userId);
    console.log(`[syncUser] Assignment enrichment completed (${Date.now() - startTime}ms)`);
  } catch (err) {
    console.error('[syncUser] Assignment enrichment failed:', err);
  }

  // ── Phase 2b: independent enrichers ────────────────────────────
  console.log('[syncUser] Phase 2b starting (parallel: BerkeleyTime + Syllabus)');
  const [btResult, syllabusResult] = await Promise.allSettled([
    syncBerkeleytime(userId),
    syncSyllabus(userId),
  ]);

  if (btResult.status === 'rejected') {
    console.error('[Phase 2b] BerkeleyTime failed:', btResult.reason);
  }
  if (syllabusResult.status === 'rejected') {
    console.error('[Phase 2b] Syllabus failed:', syllabusResult.reason);
  }

  // ── Deduplication + matching: needs ALL above settled ──────────
  try {
    await runAssignmentMatchingWithGate(userId);
    console.log(`[syncUser] Assignment matching completed (${Date.now() - startTime}ms)`);
  } catch (err) {
    console.error('[syncUser] Assignment matching failed:', err);
  }

  // Update sync timestamp again and revalidate after phase 2
  await db.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

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

  console.log(`[syncUser] Phase 2 complete in ${Date.now() - startTime}ms`);
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

async function buildAssignmentMatchingHash(
  userId: string,
  assignments: { id: string; name: string; courseId: string }[]
): Promise<string> {
  // Include syllabus structure so edits to component groups or clobber
  // policies also trigger a rematch
  const groups = await db.componentGroup.findMany({
    where: {
      syllabus: {
        course: {
          enrollments: { some: { userId } },
        },
      },
    },
    select: { id: true, name: true, syllabusId: true },
  });

  const policies = await db.clobberPolicy.findMany({
    where: {
      syllabus: {
        course: {
          enrollments: { some: { userId } },
        },
      },
    },
    select: { sourceName: true, targetName: true, comparisonType: true },
  });

  const serialized = [
    ...assignments.map(a => `a:${a.id}:${a.name}:${a.courseId}`),
    ...groups.map(g => `g:${g.id}:${g.syllabusId}:${g.name}`),
    ...policies.map(p => `p:${p.sourceName}:${p.targetName}:${p.comparisonType}`),
  ].sort().join('|');

  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

async function runAssignmentMatchingWithGate(userId: string): Promise<void> {
  const assignments = await db.assignment.findMany({
    where: {
      course: {
        enrollments: { some: { userId } },
      },
      isCurrentSemester: true,
    },
    select: { id: true, name: true, courseId: true },
  });

  const currentHash = await buildAssignmentMatchingHash(userId, assignments);

  const meta = await db.syncMetadata.findUnique({
    where: { userId_source: { userId, source: 'assignment_matcher' } },
  });

  if (meta?.lastSynced && meta?.contentHash === currentHash) {
    console.log('[syncUser] Assignment list unchanged — skipping rematch');
    return;
  }

  await runAssignmentMatching(userId);

  await db.syncMetadata.upsert({
    where: { userId_source: { userId, source: 'assignment_matcher' } },
    update: { lastSynced: new Date(), contentHash: currentHash },
    create: {
      userId,
      source: 'assignment_matcher',
      lastSynced: new Date(),
      contentHash: currentHash,
      initialBackfillCompleted: true,
    },
  });
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
