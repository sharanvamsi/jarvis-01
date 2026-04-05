/**
 * One-off script: Re-run assignment matching for all current-semester courses.
 * Usage: cd ~/jarvis-pipeline && npx tsx --env-file=.env src/scripts/rematch-all.ts
 */

import { db } from '../lib/db';
import { matchAssignmentsToGroups } from '../lib/assignment-matcher';

async function main() {
  console.log('Starting rematch for all current-semester courses...\n');

  const syllabi = await db.syllabus.findMany({
    where: { course: { isCurrentSemester: true } },
    include: {
      course: {
        include: {
          assignments: {
            select: { id: true, name: true, assignmentType: true },
          },
        },
      },
      componentGroups: true,
    },
  });

  let totalLlmCalls = 0;
  const summaries: string[] = [];

  for (const syllabus of syllabi) {
    const course = syllabus.course;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${course.courseCode} — ${course.assignments.length} assignments`);
    console.log(
      `Groups: ${syllabus.componentGroups.map((g) => g.name).join(', ')}`,
    );

    const groups = syllabus.componentGroups.map((g) => ({
      id: g.id,
      name: g.name,
      weight: g.weight,
      isExam: g.isExam,
    }));

    const results = await matchAssignmentsToGroups(
      course.assignments,
      groups,
      course.courseCode,
    );

    // Delete existing mappings and store new ones
    await db.assignmentGroupMapping.deleteMany({
      where: { assignment: { courseId: course.id } },
    });

    const toCreate = results.filter(
      (r) => r.componentGroupId !== null && r.confidence !== 'low',
    );

    if (toCreate.length > 0) {
      await db.assignmentGroupMapping.createMany({
        data: toCreate.map((r) => ({
          assignmentId: r.assignmentId,
          componentGroupId: r.componentGroupId!,
        })),
        skipDuplicates: true,
      });
    }

    const synonymCount = results.filter(
      (r) => r.reasoning.includes('synonym') && r.componentGroupId,
    ).length;
    const llmCount = results.filter(
      (r) => !r.reasoning.includes('synonym') && r.componentGroupId,
    ).length;
    const unmatchedCount = results.filter(
      (r) => !r.componentGroupId,
    ).length;

    if (llmCount > 0) totalLlmCalls++;

    const summary = `  ${course.courseCode}: ${toCreate.length}/${course.assignments.length} mapped (${synonymCount} synonym, ${llmCount} LLM, ${unmatchedCount} unmatched)`;
    summaries.push(summary);

    console.log(`\nResult: ${toCreate.length}/${course.assignments.length} mapped`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('REMATCH SUMMARY:');
  for (const s of summaries) console.log(s);
  console.log(`Total LLM calls: ${totalLlmCalls}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
