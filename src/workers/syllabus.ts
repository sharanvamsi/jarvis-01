import crypto from 'crypto';
import { db } from '../lib/db';
import type { Prisma } from '../generated/prisma';
import { decrypt } from '../lib/crypto';
import { fetchCanvasSyllabus, fetchWebsiteSyllabus } from '../lib/syllabus-fetcher';
import { extractSyllabus } from '../lib/syllabus-extractor';

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function syncSyllabus(userId: string): Promise<void> {
  console.log(`[syllabus] Starting sync for user ${userId}`);

  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: { syllabus: true },
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

    console.log(`[syllabus] Fetching syllabus for ${course.courseCode}`);

    let rawText: string | null = null;
    let source: 'canvas' | 'website' = 'canvas';

    // CS courses: try course website first
    const isCS =
      course.courseCode.startsWith('CS') ||
      course.courseCode.startsWith('EECS') ||
      course.courseCode.startsWith('DATA');

    if (isCS && course.websiteUrl) {
      rawText = await fetchWebsiteSyllabus(course.websiteUrl);
      source = 'website';
    }

    if (!rawText && canvasToken && course.canvasId) {
      rawText = await fetchCanvasSyllabus(course.canvasId, canvasToken);
      source = 'canvas';
    }

    if (!rawText) {
      console.log(`[syllabus] No syllabus found for ${course.courseCode}`);
      continue;
    }

    // Content hash guard — skip LLM extraction if content unchanged
    if (course.syllabus?.rawText) {
      const newHash = hashText(rawText);
      const existingHash = hashText(course.syllabus.rawText);
      if (newHash === existingHash) {
        console.log(`[syllabus] Skipping ${course.courseCode} (content unchanged)`);
        continue;
      }
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
          source,
          rawText,
          isCurved: extracted.isCurved,
          curveDescription: extracted.curveDescription,
        },
        update: {
          source,
          rawText,
          isCurved: extracted.isCurved,
          curveDescription: extracted.curveDescription,
          extractedAt: new Date(),
          confirmedAt: null, // re-confirm if re-extracted
          confirmedBy: null,
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
      for (const policy of extracted.clobberPolicies) {
        await tx.clobberPolicy.create({
          data: {
            syllabusId: syllabus.id,
            sourceName: policy.sourceName,
            targetName: policy.targetName,
            comparisonType: policy.comparisonType,
            conditionText: policy.conditionText,
          },
        });
      }
    });

    console.log(`[syllabus] + ${course.courseCode} — ${extracted.componentGroups.length} groups stored (pending confirmation)`);
  }
}
