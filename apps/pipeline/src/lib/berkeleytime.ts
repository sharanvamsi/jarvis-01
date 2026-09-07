export interface BTDistributionItem {
  letter: string;
  percentage: number;
  count: number;
}

export interface BTGradeDistribution {
  average: number | null;
  pnpPercentage: number | null;
  distribution: BTDistributionItem[];
}

// BT semester enum values
export type BTSemester = "Spring" | "Fall" | "Summer";

export interface BTSemesterSpec {
  year: number;
  semester: BTSemester;
  sessionId: "1"; // always "1" for regular academic sessions
}

const BT_ENDPOINT = "https://berkeleytime.com/api/graphql";

// Berkeleytime's public gateway accepts only allow-listed operation IDs, not
// raw GraphQL documents. These IDs are from its public frontend operation
// manifest. First resolve the stable Berkeleytime course ID, then request the
// distribution with the current grade operation.
const GET_COURSE_OPERATION = "c3d34f9ffd39827dce61241e71fc4503393668e9d97a3ba470f3ece5eef5c80e";
const GET_GRADE_OPERATION = "3b25e544b49e4ce0b13cfe0e3a89f2ccf5ac28fa836d315e558929f11ab086b5";
const courseIdCache = new Map<string, string | null>();

const SUBJECT_MAP: Record<string, string> = {
  CS: "COMPSCI",
  EECS: "EECS",
  UGBA: "UGBA",
  DATA: "DATA",
  STAT: "STAT",
  MATH: "MATH",
  PHYSICS: "PHYSICS",
  CHEM: "CHEMISTRY",
  MCELLBI: "MCELLBI",
  PSYCH: "PSYCH",
  ECON: "ECON",
};

// Parses "Jonathan Shewchuk" → { givenName: "Jonathan", familyName: "Shewchuk" }
// Handles "Dr. John Smith" → strips title
// Returns null if unparseable
export function parseInstructorName(
  fullName: string
): { givenName: string; familyName: string } | null {
  // Strip common titles
  const cleaned = fullName
    .replace(/^(Dr|Prof|Professor|Mr|Ms|Mrs)\.?\s+/i, "")
    .trim();

  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) return null;

  return {
    givenName: parts[0],
    familyName: parts[parts.length - 1],
  };
}

export function parseCourseCodeForBT(
  courseCode: string
): { subject: string; courseNumber: string } | null {
  // Canvas commonly appends term shorthands such as "-F26" to otherwise
  // valid course codes. Berkeleytime expects the catalog number only.
  const normalized = courseCode
    .trim()
    .toUpperCase()
    .replace(/[-\s](?:WI|SP|SU|FA|F)\d{2}$/, "");
  const match = normalized.match(/^([A-Z]+)\s+(\d+[A-Z]?)$/);
  if (!match) return null;
  const [, dept, num] = match;
  return { subject: SUBJECT_MAP[dept] ?? dept, courseNumber: num };
}

// Generate all regular semesters from FA18 to current where grades could exist.
// BT grades publish ~August for Spring and ~February (next year) for Fall.
export function generateSemesterSpecs(): BTSemesterSpec[] {
  const specs: BTSemesterSpec[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed, 0=Jan

  for (let year = 2018; year <= currentYear; year++) {
    // Spring grades publish ~August (month 7)
    // So include Spring {year} only if we're past August of that year
    if (year < currentYear || currentMonth >= 7) {
      specs.push({ year, semester: "Spring", sessionId: "1" });
    }

    // Fall grades publish ~February of the NEXT year (month 1)
    // So include Fall {year} only if we're in Feb+ of year+1
    const fallPublished =
      currentYear > year + 1 ||
      (currentYear === year + 1 && currentMonth >= 1);
    if (fallPublished) {
      specs.push({ year, semester: "Fall", sessionId: "1" });
    }
  }

  return specs;
}

// Returns the 2 most recent semesters for incremental syncs
export function getRecentSemesterSpecs(): BTSemesterSpec[] {
  const all = generateSemesterSpecs();
  return all.slice(-2);
}

async function btFetch<T>(
  operationId: string,
  variables: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(BT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: operationId, variables }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.warn(`[BT] API request failed (${res.status})`);
      return null;
    }
    const json: any = await res.json();
    if (json?.errors?.length) {
      console.warn(`[BT] API returned an error: ${json.errors[0]?.message ?? "unknown error"}`);
      return null;
    }
    return json?.data ?? null;
  } catch (error) {
    console.warn(`[BT] API request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function resolveCourseId(subject: string, courseNumber: string): Promise<string | null> {
  const key = `${subject}:${courseNumber}`;
  if (courseIdCache.has(key)) return courseIdCache.get(key)!;

  const data = await btFetch<{ course?: { courseId?: string | null } }>(
    GET_COURSE_OPERATION,
    { subject, number: courseNumber },
  );
  const courseId = data?.course?.courseId ?? null;
  courseIdCache.set(key, courseId);
  if (!courseId) console.log(`[BT] No Berkeleytime course found for ${subject} ${courseNumber}`);
  return courseId;
}

async function fetchGrade(
  subject: string,
  courseNumber: string,
  filters: Record<string, unknown> = {},
): Promise<BTGradeDistribution | null> {
  const courseId = await resolveCourseId(subject, courseNumber);
  if (!courseId) return null;
  const data = await btFetch<{ grade?: BTGradeDistribution | null }>(
    GET_GRADE_OPERATION,
    { subject, courseId, ...filters },
  );
  const grade = data?.grade;
  return grade?.distribution?.length ? grade : null;
}

export async function fetchAllTime(
  subject: string,
  courseNumber: string
): Promise<BTGradeDistribution | null> {
  return fetchGrade(subject, courseNumber);
}

export async function fetchBySemester(
  subject: string,
  courseNumber: string,
  spec: BTSemesterSpec
): Promise<BTGradeDistribution | null> {
  return fetchGrade(subject, courseNumber, {
    year: spec.year,
    semester: spec.semester,
    sessionId: spec.sessionId,
  });
}

export async function fetchByInstructor(
  subject: string,
  courseNumber: string,
  familyName: string,
  givenName: string
): Promise<BTGradeDistribution | null> {
  return fetchGrade(subject, courseNumber, {
    familyName,
    givenName,
  });
}

export async function fetchByInstructorAndSemester(
  subject: string,
  courseNumber: string,
  spec: BTSemesterSpec,
  familyName: string,
  givenName: string
): Promise<BTGradeDistribution | null> {
  return fetchGrade(subject, courseNumber, {
    year: spec.year,
    semester: spec.semester,
    sessionId: spec.sessionId,
    familyName,
    givenName,
  });
}
