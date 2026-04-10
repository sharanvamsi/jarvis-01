import crypto from 'crypto';
import { db } from '../lib/db';
import type { Prisma } from '@jarvis/db';
import { decrypt } from '../lib/crypto';
import { fetchCanvasSyllabus } from '../lib/syllabus-fetcher';
import { extractSyllabus } from '../lib/syllabus-extractor';

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function syncSyllabus(userId: string): Promise<void> {
  console.log(`[syllabus] Starting sync for user ${userId}`);

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          syllabus: {
            include: { document: true },
          },
        },
      },
    },
  });

  // Get Canvas token for this user
  const canvasSyncToken = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'canvas' } },
  });
  let canvasToken: string | null = null;
  if (canvasSyncToken) {
    try {
      canvasToken = decrypt(canvasSyncToken.accessToken);
    } catch (err) {
      console.error('[syllabus] Failed to decrypt Canvas token:', err);
    }
  }

  for (const enrollment of enrollments) {
    const course = enrollment.course;
    if (!course.isCurrentSemester) continue;

    // Skip if already confirmed this semester — syllabus rarely changes
    if (course.syllabus?.confirmedAt) {
      console.log(`[syllabus] Skipping ${course.courseCode} (already confirmed)`);
      continue;
    }

    // Skip if the course website worker already wrote grading policy —
    // multi-page website extraction is higher quality than single-page Canvas HTML
    if (course.syllabus?.document?.source === 'website') {
      console.log(`[syllabus] Skipping ${course.courseCode} (website-extracted grading exists)`);
      continue;
    }

    console.log(`[syllabus] Fetching syllabus for ${course.courseCode}`);

    // Website grading is handled by the course website worker (multi-page crawl).
    // This worker only handles Canvas-sourced syllabi.
    let rawText: string | null = null;

    if (canvasToken && course.canvasId) {
      rawText = await fetchCanvasSyllabus(course.canvasId, canvasToken);
    }

    if (!rawText) {
      console.log(`[syllabus] No syllabus found for ${course.courseCode}`);
      continue;
    }

    const newHash = hashText(rawText);

    // Content hash guard — skip LLM extraction if content unchanged
    if (course.syllabus?.document?.contentHash === newHash) {
      console.log(`[syllabus] Skipping ${course.courseCode} (content unchanged)`);
      continue;
    }

    // Extract structure via LLM
    let extracted;
    try {
      extracted = await extractSyllabus(rawText, course.courseCode);
    } catch (error) {
      console.error(`[syllabus] Extraction failed for ${course.courseCode}:`, error);
      continue;
    }

    console.log(
      `[syllabus] ${course.courseCode} — curved: ${extracted.isCurved}, ` +
        `${extracted.componentGroups.length} groups, ` +
        `${extracted.clobberPolicies.length} clobber policies`,
    );

    // Store in DB — component groups only, no assignment matching here.
    // Assignment matching runs in syncUser after all workers complete.
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Upsert syllabus
      const syllabus = await tx.syllabus.upsert({
        where: { courseId: course.id },
        create: {
          courseId: course.id,
          isCurved: extracted.isCurved,
          curveDescription: extracted.curveDescription,
        },
        update: {
          isCurved: extracted.isCurved,
          curveDescription: extracted.curveDescription,
          extractedAt: new Date(),
          confirmedAt: null, // re-confirm if re-extracted
          confirmedBy: null,
        },
      });

      // Upsert syllabus document (heavy raw text + content hash)
      await tx.syllabusDocument.upsert({
        where: { syllabusId: syllabus.id },
        create: {
          syllabusId: syllabus.id,
          source: 'canvas_html',
          rawText: rawText!,
          contentHash: newHash,
        },
        update: {
          source: 'canvas_html',
          rawText: rawText!,
          contentHash: newHash,
          fetchedAt: new Date(),
        },
      });

      // Delete existing component groups, grade scale, clobber policies and recreate
      await tx.componentGroup.deleteMany({ where: { syllabusId: syllabus.id } });
      await tx.gradeScale.deleteMany({ where: { syllabusId: syllabus.id } });
      await tx.clobberPolicy.deleteMany({ where: { syllabusId: syllabus.id } });

      // Create component groups (no matching here — that's in syncUser)
      for (const group of extracted.componentGroups) {
        await tx.componentGroup.create({
          data: {
            syllabusId: syllabus.id,
            name: group.name,
            weight: group.weight,
            dropLowest: group.dropLowest,
            isBestOf: group.isBestOf,
            isExam: group.isExam,
          },
        });
      }

      // Create grade scale if present
      if (extracted.gradeScale) {
        await tx.gradeScale.createMany({
          data: extracted.gradeScale.map((gs) => ({
            syllabusId: syllabus.id,
            letter: gs.letter,
            minScore: gs.minScore,
            maxScore: gs.maxScore,
            isPoints: gs.isPoints,
          })),
        });
      }

      // Create clobber policies
      const createdPolicies = [];
      for (const policy of extracted.clobberPolicies) {
        const created = await tx.clobberPolicy.create({
          data: {
            syllabusId: syllabus.id,
            sourceName: policy.sourceName,
            targetName: policy.targetName,
            comparisonType: policy.comparisonType,
            conditionText: policy.conditionText,
          },
        });
        createdPolicies.push(created);
      }

      // Resolve clobber policy name → FK references
      const createdGroups = await tx.componentGroup.findMany({
        where: { syllabusId: syllabus.id },
        select: { id: true, name: true },
      });

      const groupByName = Object.fromEntries(
        createdGroups.map(g => [g.name.toLowerCase().trim(), g.id])
      );

      for (const policy of createdPolicies) {
        const sourceId = groupByName[policy.sourceName.toLowerCase().trim()];
        const targetId = groupByName[policy.targetName.toLowerCase().trim()];

        if (sourceId && targetId) {
          await tx.clobberPolicy.update({
            where: { id: policy.id },
            data: { sourceGroupId: sourceId, targetGroupId: targetId },
          });
        } else {
          console.warn(
            `[Syllabus] Could not resolve clobber policy: ` +
            `"${policy.sourceName}" → "${policy.targetName}" ` +
            `(available: ${Object.keys(groupByName).join(', ')})`
          );
        }
      }
    });

    console.log(`[syllabus] + ${course.courseCode} — ${extracted.componentGroups.length} groups stored (pending confirmation)`);
  }
}
