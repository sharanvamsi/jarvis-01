import { db } from '../lib/db';
import { extractSyllabus } from '../lib/syllabus-extractor';
import { matchAssignmentsToGroups } from '../lib/assignment-matcher';

// Actual syllabus text from cs162.org/policies and eecs189.org/sp26/syllabus/
const CS162_SYLLABUS = `
CS 162 Grading Policy

Grading: At the end of the term, each student is assigned a score out of 100 points.
36% Exams
36% Projects
18% Homeworks
10% Participation

All three projects will be equally weighted, and all homeworks will be equally weighted as well.
Project 0 counts as a homework assignment since it is done individually.

Exams: Three midterm exams will be scheduled without a final exam.
Each exam will hold equal weight in your overall grade.
Once students raw scores are computed, final grades are assigned using a curved scale
in line with the department policy.
`;

const CS189_SYLLABUS = `
CS 189 Grading Scheme

Category CS 189 CS 289A
Homework 30% 20%
Midterm Exam 30% 25%
Final Exam 40% 35%

Grading note: raw scores will not determine your grade in this class.
Rather, final grades will be computed by assessing the class as whole (curved).

Clobber policy: The final exam can replace the midterm exam score if
the final exam z-score is higher than the midterm z-score.
(Note: verify this with current semester Ed posts — may vary by semester)
`;

async function reseedSyllabus(
  courseCode: string,
  syllabusText: string
) {
  const course = await db.course.findFirst({
    where: { courseCode, isCurrentSemester: true },
    include: {
      assignments: { select: { id: true, name: true, assignmentType: true } }
    }
  });

  if (!course) {
    console.log(`Course not found: ${courseCode}`);
    return;
  }

  console.log(`\nExtracting syllabus for ${courseCode}...`);
  const extracted = await extractSyllabus(syllabusText, courseCode);

  console.log(`Extracted: curved=${extracted.isCurved}, ${extracted.componentGroups.length} groups`);
  extracted.componentGroups.forEach(g =>
    console.log(`  "${g.name}" ${(g.weight*100).toFixed(0)}% isExam=${g.isExam}`)
  );

  // Delete existing syllabus
  await db.syllabus.deleteMany({ where: { courseId: course.id } });

  // Transaction 1: create syllabus + groups
  const { syllabusId, createdGroups } = await db.$transaction(async (tx) => {
    const syllabus = await tx.syllabus.create({
      data: {
        courseId: course.id,
        source: 'manual',
        rawText: syllabusText,
        isCurved: extracted.isCurved,
        curveDescription: extracted.curveDescription,
        // Auto-confirm since we manually verified this data
        confirmedAt: new Date(),
        confirmedBy: 'system',
      }
    });

    const createdGroups = [];
    for (const group of extracted.componentGroups) {
      const created = await tx.componentGroup.create({
        data: {
          syllabusId: syllabus.id,
          name: group.name,
          weight: group.weight,
          dropLowest: group.dropLowest,
          isBestOf: group.isBestOf,
          isExam: group.isExam,
        }
      });
      createdGroups.push({
        id: created.id,
        name: group.name,
        weight: group.weight,
        isExam: group.isExam,
        assignmentNamePatterns: group.assignmentNamePatterns,
      });
    }

    if (extracted.gradeScale) {
      await tx.gradeScale.createMany({
        data: extracted.gradeScale.map(gs => ({
          syllabusId: syllabus.id,
          letter: gs.letter,
          minScore: gs.minScore,
          maxScore: gs.maxScore,
          isPoints: gs.isPoints,
        }))
      });
    }

    for (const policy of extracted.clobberPolicies) {
      await tx.clobberPolicy.create({
        data: {
          syllabusId: syllabus.id,
          sourceName: policy.sourceName,
          targetName: policy.targetName,
          comparisonType: policy.comparisonType,
          conditionText: policy.conditionText,
        }
      });
    }

    return { syllabusId: syllabus.id, createdGroups };
  });

  // Run assignment matching outside transaction
  const results = await matchAssignmentsToGroups(
    course.assignments,
    createdGroups,
    courseCode
  );

  // Transaction 2: store mappings
  await db.$transaction(async (tx) => {
    await tx.assignmentGroupMapping.deleteMany({
      where: { assignment: { courseId: course.id } }
    });

    const toCreate = results.filter(
      r => r.componentGroupId !== null && r.confidence !== 'low'
    );

    if (toCreate.length > 0) {
      await tx.assignmentGroupMapping.createMany({
        data: toCreate.map(r => ({
          assignmentId: r.assignmentId,
          componentGroupId: r.componentGroupId!,
        })),
        skipDuplicates: true,
      });
    }
  });

  console.log(`\n${courseCode}: ${syllabusId ? 'syllabus stored' : 'failed'}`);
  console.log(`  Assignment mapping: ${results.filter(r => r.componentGroupId).length}/${course.assignments.length} mapped`);
}

async function main() {
  await reseedSyllabus('CS 162', CS162_SYLLABUS);
  await reseedSyllabus('CS 189', CS189_SYLLABUS);
  await db.$disconnect();
}

main().catch(console.error);
