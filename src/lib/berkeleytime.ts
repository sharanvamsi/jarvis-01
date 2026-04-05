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

// Query for all-time aggregate (no semester filter)
const QUERY_ALL_TIME = `
  query GetGradeAllTime($subject: String!, $courseNumber: CourseNumber!) {
    grade(subject: $subject, courseNumber: $courseNumber) {
      average
      pnpPercentage
      distribution { letter percentage count }
    }
  }
`;

// Query for a specific semester
const QUERY_BY_SEMESTER = `
  query GetGradeBySemester(
    $subject: String!
    $courseNumber: CourseNumber!
    $year: Int!
    $semester: Semester!
    $sessionId: SessionIdentifier!
  ) {
    grade(
      subject: $subject
      courseNumber: $courseNumber
      year: $year
      semester: $semester
      sessionId: $sessionId
    ) {
      average
      pnpPercentage
      distribution { letter percentage count }
    }
  }
`;

// Query for a specific instructor
const QUERY_BY_INSTRUCTOR = `
  query GetGradeByInstructor(
    $subject: String!
    $courseNumber: CourseNumber!
    $familyName: String!
    $givenName: String!
  ) {
    grade(
      subject: $subject
      courseNumber: $courseNumber
      familyName: $familyName
      givenName: $givenName
    ) {
      average
      pnpPercentage
      distribution { letter percentage count }
    }
  }
`;

// Query for instructor + semester
const QUERY_BY_INSTRUCTOR_AND_SEMESTER = `
  query GetGradeByInstructorAndSemester(
    $subject: String!
    $courseNumber: CourseNumber!
    $year: Int!
    $semester: Semester!
    $sessionId: SessionIdentifier!
    $familyName: String!
    $givenName: String!
  ) {
    grade(
      subject: $subject
      courseNumber: $courseNumber
      year: $year
      semester: $semester
      sessionId: $sessionId
      familyName: $familyName
      givenName: $givenName
    ) {
      average
      pnpPercentage
      distribution { letter percentage count }
    }
  }
`;

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
  const match = courseCode.trim().match(/^([A-Z]+)\s+(\w+)$/);
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

async function btFetch(
  query: string,
  variables: Record<string, unknown>
): Promise<BTGradeDistribution | null> {
  try {
    const res = await fetch(BT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const grade = json?.data?.grade;
    if (!grade || !grade.distribution?.length) return null;
    return grade as BTGradeDistribution;
  } catch {
    return null;
  }
}

export async function fetchAllTime(
  subject: string,
  courseNumber: string
): Promise<BTGradeDistribution | null> {
  return btFetch(QUERY_ALL_TIME, { subject, courseNumber });
}

export async function fetchBySemester(
  subject: string,
  courseNumber: string,
  spec: BTSemesterSpec
): Promise<BTGradeDistribution | null> {
  return btFetch(QUERY_BY_SEMESTER, {
    subject,
    courseNumber,
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
  return btFetch(QUERY_BY_INSTRUCTOR, {
    subject,
    courseNumber,
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
  return btFetch(QUERY_BY_INSTRUCTOR_AND_SEMESTER, {
    subject,
    courseNumber,
    year: spec.year,
    semester: spec.semester,
    sessionId: spec.sessionId,
    familyName,
    givenName,
  });
}
