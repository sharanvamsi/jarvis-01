const DEPT_ALIASES: Record<string, string> = {
  'COMPSCI': 'CS',
  'EECS': 'EECS',
};

const COURSE_ALIASES: Record<string, string> = {
  'EECS 189': 'CS 189',
  'CS 189/289A': 'CS 189',
};

const NON_ACADEMIC_NAME_MARKERS = [
  'orientation', 'golden bear', 'shape', 'advising', 'sell out',
];

const NON_ACADEMIC_CODE_PREFIXES = ['GBA', 'GBO', 'GBP', 'SHAPE'];

const SKIP_SUBSTRINGS = [
  'ORIENTATION', 'ENROLLMENT COURSE', 'GOLDEN BEAR PREP',
  'GOLDEN BEAR ORIENTATION', 'GOLDEN BEAR ADVISING',
];

const ABBREVIATIONS: Record<string, string> = {
  'hw': 'homework',
  'proj': 'project',
  'mt': 'midterm',
};

const SEMESTER_PATTERNS: Array<{ markers: string[]; code: string }> = [
  { markers: ['spring 2026', 'sp26'], code: 'SP26' },
  { markers: ['fall 2025', 'fa25'], code: 'FA25' },
  { markers: ['spring 2025', 'sp25'], code: 'SP25' },
  { markers: ['fall 2024', 'fa24'], code: 'FA24' },
  { markers: ['spring 2024', 'sp24'], code: 'SP24' },
  { markers: ['fall 2023', 'fa23'], code: 'FA23' },
];

const PAST_TERMS = ['Fall 2023', 'Spring 2024', 'Fall 2024', 'Spring 2025', 'Fall 2025'];

export function normalizeCourseCode(code: string): string {
  let normalized = code.trim().toUpperCase();
  // Strip trailing hyphens
  normalized = normalized.replace(/-+$/, '');
  // Strip semester suffixes first: SP24, FA25, etc. (before & NNN since it may follow)
  normalized = normalized.replace(/\s*(?:SP|FA|SU)\d{2}$/i, '');
  // Strip section suffixes: -LEC-001, -DIS-001, etc.
  normalized = normalized.replace(/-(?:LEC|DIS|LAB|SEM|IND|FLD|REC|TUT)-\d+/g, '');
  // Strip " & NNN" section suffixes (e.g., "& 002")
  normalized = normalized.replace(/\s*&\s*\d+/g, '');
  // Strip cross-listings: /289A
  normalized = normalized.replace(/\/\w+$/, '');
  // Strip trailing hyphens again (after other processing)
  normalized = normalized.replace(/-+$/, '');
  // Insert space between department letters and course number if missing (e.g., EECS189 → EECS 189)
  normalized = normalized.replace(/^([A-Z]+)(\d)/, '$1 $2');
  // Apply department aliases
  for (const [alias, canonical] of Object.entries(DEPT_ALIASES)) {
    if (normalized.startsWith(alias + ' ')) {
      normalized = canonical + normalized.slice(alias.length);
    }
  }
  // Apply course aliases
  if (COURSE_ALIASES[normalized]) {
    normalized = COURSE_ALIASES[normalized];
  }
  return normalized.trim();
}

export function normalizeAssignmentName(name: string): string {
  let normalized = name.toLowerCase();
  // Expand abbreviations
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  // Strip course prefix (e.g., "CS 162:", "CS162 ") but NOT assignment type prefixes
  // Only strip short 2-4 letter department codes, not words like "homework" or "project"
  normalized = normalized.replace(/^[a-z]{2,4}\s*\d{2,}[a-z]?\s*[:]\s*/i, '');
  // Strip special chars except alphanumeric and spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

export function assignmentNamesMatch(a: string, b: string): boolean {
  const na = normalizeAssignmentName(a);
  const nb = normalizeAssignmentName(b);
  if (na === nb) return true;
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  // 80% word overlap
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const minSize = Math.min(wordsA.size, wordsB.size);
  if (minSize > 0 && intersection / minSize >= 0.8) return true;
  // Fallback: same assignment type prefix + same number
  // e.g. "homework 3 written" and "homework 3 http c version" both start with "homework 3"
  const prefixA = na.match(/^(homework|project|lab|hw|exam|midterm|final)\s*\d+/)?.[0];
  const prefixB = nb.match(/^(homework|project|lab|hw|exam|midterm|final)\s*\d+/)?.[0];
  if (prefixA && prefixB && prefixA === prefixB) return true;
  return false;
}

export function datesWithin24Hours(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return Math.abs(a.getTime() - b.getTime()) < 24 * 60 * 60 * 1000;
}

export function extractSemester(courseName: string, courseCode: string): string {
  const combined = `${courseName} ${courseCode}`.toLowerCase();
  for (const { markers, code } of SEMESTER_PATTERNS) {
    if (markers.some(m => combined.includes(m))) return code;
  }
  return 'UNKNOWN';
}

export function isNonAcademicCourse(name: string, code: string): boolean {
  const lowerName = name.toLowerCase();
  const upperCode = code.toUpperCase();
  if (NON_ACADEMIC_NAME_MARKERS.some(m => lowerName.includes(m))) return true;
  if (NON_ACADEMIC_CODE_PREFIXES.some(p => upperCode.startsWith(p))) return true;
  const upperName = name.toUpperCase();
  if (SKIP_SUBSTRINGS.some(s => upperName.includes(s))) return true;
  return false;
}

export function isCurrentCourse(name: string, code: string, currentSemester: string): boolean {
  const sem = SEMESTER_PATTERNS.find(s => s.code === currentSemester);
  if (!sem) return false;
  const combined = `${name} ${code}`.toLowerCase();
  return sem.markers.some(m => combined.includes(m));
}

export function correctEnrollmentState(
  enrollmentState: string | null,
  name: string,
  code: string
): string {
  if (isNonAcademicCourse(name, code)) return 'completed';
  const combinedLower = `${name} ${code}`.toLowerCase();
  for (const term of PAST_TERMS) {
    if (combinedLower.includes(term.toLowerCase())) return 'completed';
  }
  return enrollmentState || 'active';
}

export function parseNextCanvasLink(header: string): string | null {
  const parts = header.split(',');
  for (const part of parts) {
    const segments = part.split(';');
    if (segments.length < 2) continue;
    const relPart = segments[1].trim();
    if (relPart === 'rel="next"') {
      let urlPart = segments[0].trim();
      if (urlPart.startsWith('<')) urlPart = urlPart.slice(1);
      if (urlPart.endsWith('>')) urlPart = urlPart.slice(0, -1);
      return urlPart;
    }
  }
  return null;
}
