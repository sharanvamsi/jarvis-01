import { db } from "../lib/db";
import {
  fetchAllTime,
  fetchBySemester,
  fetchByInstructor,
  fetchByInstructorAndSemester,
  generateSemesterSpecs,
  getRecentSemesterSpecs,
  parseCourseCodeForBT,
  parseInstructorName,
} from "../lib/berkeleytime";

// Delay between BT API calls to avoid hammering their server
const INTER_CALL_DELAY_MS = 150;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function upsertSnapshot(
  btCourseId: string,
  year: number,
  semester: string,
  instructor: string | null,
  data: { average: number | null; pnpPercentage: number | null; distribution: unknown }
) {
  const instructorKey = instructor ?? "__all__";

  await db.berkeleyTimeSnapshot.upsert({
    where: {
      btCourseId_year_semester_instructorKey: {
        btCourseId,
        year,
        semester,
        instructorKey,
      },
    },
    create: {
      btCourseId,
      year,
      semester,
      instructor,
      instructorKey,
      average: data.average,
      pnpPercentage: data.pnpPercentage,
      distribution: data.distribution as object,
    },
    update: {
      instructor,
      average: data.average,
      pnpPercentage: data.pnpPercentage,
      distribution: data.distribution as object,
    },
  });
}

async function backfillCourse(
  btCourseId: string,
  subject: string,
  courseNumber: string,
  userId: string
) {
  console.log(`[BT] Starting historical backfill for ${subject} ${courseNumber}`);

  const specs = generateSemesterSpecs();
  let fetched = 0;

  for (const spec of specs) {
    const data = await fetchBySemester(subject, courseNumber, spec);
    await sleep(INTER_CALL_DELAY_MS);

    if (!data) continue;

    await upsertSnapshot(
      btCourseId,
      spec.year,
      spec.semester,
      null, // no instructor filter on backfill sweep
      data
    );
    fetched++;
    console.log(`[BT] ${subject} ${courseNumber} ${spec.semester} ${spec.year} avg=${data.average?.toFixed(2)}`);
  }

  // Also store all-time aggregate as year=0 sentinel
  const allTime = await fetchAllTime(subject, courseNumber);
  if (allTime) {
    await upsertSnapshot(btCourseId, 0, "All", null, allTime);
  }

  // Fetch instructor-specific snapshots
  await fetchInstructorSnapshots(btCourseId, subject, courseNumber, userId);

  await db.berkeleyTimeCourse.update({
    where: { id: btCourseId },
    data: { historicalBackfillDone: true },
  });

  console.log(`[BT] Backfill complete for ${subject} ${courseNumber} — ${fetched} semesters stored`);
}

async function incrementalSync(
  btCourseId: string,
  subject: string,
  courseNumber: string,
  userId: string
) {
  console.log(`[BT] Incremental sync for ${subject} ${courseNumber}`);

  const specs = getRecentSemesterSpecs();

  for (const spec of specs) {
    const data = await fetchBySemester(subject, courseNumber, spec);
    await sleep(INTER_CALL_DELAY_MS);
    if (!data) continue;
    await upsertSnapshot(btCourseId, spec.year, spec.semester, null, data);
    console.log(`[BT] Updated ${subject} ${courseNumber} ${spec.semester} ${spec.year}`);
  }

  // Refresh all-time aggregate
  const allTime = await fetchAllTime(subject, courseNumber);
  if (allTime) {
    await upsertSnapshot(btCourseId, 0, "All", null, allTime);
  }

  // Fetch instructor-specific snapshots
  await fetchInstructorSnapshots(btCourseId, subject, courseNumber, userId);

  await db.berkeleyTimeCourse.update({
    where: { id: btCourseId },
    data: { lastIncrementalSync: new Date() },
  });
}

async function fetchInstructorSnapshots(
  btCourseId: string,
  subject: string,
  courseNumber: string,
  userId: string
) {
  // Get staff for courses this user is enrolled in with matching subject+number
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: { courseStaff: true },
      },
    },
  });

  const matchingCourse = enrollments
    .map((e) => e.course)
    .find((c) => {
      const parsed = parseCourseCodeForBT(c.courseCode);
      return parsed?.subject === subject && parsed?.courseNumber === courseNumber;
    });

  if (!matchingCourse?.courseStaff?.length) {
    console.log(`[BT] No CourseStaff for ${subject} ${courseNumber} — skipping instructor snapshots`);
    return;
  }

  let instructors = matchingCourse.courseStaff
    .filter(
      (s) =>
        s.role?.toLowerCase().includes("instructor") ||
        s.role?.toLowerCase().includes("professor")
    )
    .map((s) => parseInstructorName(s.name))
    .filter((n): n is NonNullable<typeof n> => n !== null);

  // Broader fallback: if no instructor/professor role match, try all staff
  if (instructors.length === 0) {
    console.log(`[BT] No instructor-role staff for ${subject} ${courseNumber} — trying all staff`);
    instructors = matchingCourse.courseStaff
      .map((s) => parseInstructorName(s.name))
      .filter((n): n is NonNullable<typeof n> => n !== null);
  }

  if (!instructors.length) {
    console.log(`[BT] No parseable instructor names for ${subject} ${courseNumber} — skipping`);
    return;
  }

  const specs = generateSemesterSpecs();
  // Only fetch instructor snapshots for last 6 semesters
  const recentSpecs = specs.slice(-6);

  for (const instructor of instructors) {
    console.log(
      `[BT] Fetching instructor snapshots: ${instructor.givenName} ${instructor.familyName}`
    );

    for (const spec of recentSpecs) {
      const data = await fetchByInstructorAndSemester(
        subject,
        courseNumber,
        spec,
        instructor.familyName,
        instructor.givenName
      );
      await sleep(INTER_CALL_DELAY_MS);

      if (!data) continue;

      await upsertSnapshot(
        btCourseId,
        spec.year,
        spec.semester,
        instructor.familyName,
        data
      );
      console.log(
        `[BT] ✓ ${subject} ${courseNumber} ${spec.semester} ${spec.year} ${instructor.familyName} avg=${data.average?.toFixed(2)}`
      );
    }

    // Also all-time for this instructor
    const allTime = await fetchByInstructor(
      subject,
      courseNumber,
      instructor.familyName,
      instructor.givenName
    );
    if (allTime) {
      await upsertSnapshot(
        btCourseId,
        0,
        "All",
        instructor.familyName,
        allTime
      );
      console.log(
        `[BT] ✓ ${subject} ${courseNumber} All-time ${instructor.familyName} avg=${allTime.average?.toFixed(2)}`
      );
    }
  }
}

export async function syncBerkeleytime(userId: string): Promise<void> {
  // Get all current-semester courses for this user
  const enrollments = await db.enrollment.findMany({
    where: { userId },
    include: { course: true },
  });

  const courses = enrollments
    .map((e: typeof enrollments[number]) => e.course)
    .filter((c: typeof enrollments[number]["course"]) => c.isCurrentSemester);

  for (const course of courses) {
    const parsed = parseCourseCodeForBT(course.courseCode);
    if (!parsed) {
      console.log(`[BT] Cannot parse: ${course.courseCode}`);
      continue;
    }

    // Get or create the shared BerkeleyTimeCourse record
    const btCourse = await db.berkeleyTimeCourse.upsert({
      where: {
        subject_courseNumber: {
          subject: parsed.subject,
          courseNumber: parsed.courseNumber,
        },
      },
      create: {
        subject: parsed.subject,
        courseNumber: parsed.courseNumber,
        historicalBackfillDone: false,
      },
      update: {},
    });

    // Decide: full backfill or incremental
    if (!btCourse.historicalBackfillDone) {
      await backfillCourse(btCourse.id, parsed.subject, parsed.courseNumber, userId);
    } else {
      // Incremental: only re-sync if >23 hours since last sync
      const lastSync = btCourse.lastIncrementalSync;
      if (lastSync) {
        const ageMs = Date.now() - lastSync.getTime();
        if (ageMs < 23 * 60 * 60 * 1000) {
          console.log(`[BT] Skipping ${course.courseCode} (incremental synced recently)`);
          continue;
        }
      }
      await incrementalSync(btCourse.id, parsed.subject, parsed.courseNumber, userId);
    }
  }
}
