// Course website → structured data extractor.
//
// Takes cleaned markdown pages (from html-cleaner.ts) and runs 5 sequential
// Haiku tool_use calls to extract: assignments, office hours, staff, exams,
// syllabus + grading policy.
//
// Designed for reuse by the real courseWebsite worker in stage 4.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ExtractedAssignment {
  name: string;
  type: 'homework' | 'project' | 'lab' | 'exam' | 'other';
  due_date: string | null;
  release_date: string | null;
  spec_url: string | null;
  source_page_url: string;
  confidence: number;
}

export interface ExtractedOfficeHour {
  staff_name: string;
  staff_role: 'professor' | 'ta' | 'tutor' | 'other';
  day_of_week: number; // 0=Sun … 6=Sat
  start_time: string;  // HH:MM 24hr
  end_time: string;
  location: string | null;
  zoom_link: string | null;
  confidence: number;
}

export interface ExtractedStaff {
  name: string;
  role: string;
  email: string | null;
  photo_url: string | null;
  confidence: number;
}

export interface ExtractedExam {
  name: string;
  date: string | null;
  time: string | null;
  location: string | null;
  confidence: number;
}

export interface ExtractedSyllabusWeek {
  week_num: number;
  topic: string;
  start_date: string | null;
  readings: string | null;
  confidence: number;
}

export interface ExtractedComponentGroup {
  name: string;
  weight: number;        // percentage-based: 0.0–1.0 fraction; points-based: raw max points
  drop_lowest: number;
  is_best_of: boolean;
  is_exam: boolean;
  assignment_name_patterns: string[];
  confidence: number;
}

export interface ExtractedClobberPolicy {
  source_name: string;
  target_name: string;
  comparison_type: 'raw' | 'zscore';
  condition_text: string;
  confidence: number;
}

export interface ExtractedGradeScale {
  letter: string;
  min_score: number;
  max_score: number;
  is_points: boolean;
}

export interface ExtractedGradingPolicy {
  is_points_based: boolean; // true = raw points (sum points, compare to point scale); false = percentage weights (weighted avg, compare to pct scale)
  total_points: number | null; // only set when is_points_based=true (e.g. 300 for CS 61A)
  is_curved: boolean;
  curve_description: string | null;
  component_groups: ExtractedComponentGroup[];
  clobber_policies: ExtractedClobberPolicy[];
  grade_scale: ExtractedGradeScale[] | null;
  notes: string;
  confidence: number;
}

export interface ExtractionResult {
  assignments: ExtractedAssignment[];
  office_hours: ExtractedOfficeHour[];
  staff: ExtractedStaff[];
  exams: ExtractedExam[];
  syllabus_weeks: ExtractedSyllabusWeek[];
  grading_policy: ExtractedGradingPolicy | null;
  extraction_meta: {
    model: string;
    categories_attempted: string[];
    categories_succeeded: string[];
    categories_failed: { category: string; error: string }[];
    per_category: {
      category: string;
      input_tokens: number;
      output_tokens: number;
      cost_usd: number;
      elapsed_ms: number;
    }[];
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    elapsed_ms: number;
  };
}

// ---------------------------------------------------------------------------
// Page routing — select relevant pages per category
// ---------------------------------------------------------------------------

type ExtractionCategory = 'assignments' | 'office_hours' | 'staff' | 'exams' | 'syllabus';

const PAGE_ROUTING: Record<ExtractionCategory, { urlPatterns: RegExp[]; contentKeywords: string[] }> = {
  assignments: {
    urlPatterns: [/assign/i, /homework/i, /hw/i, /project/i, /lab/i, /schedule/i, /calendar/i],
    contentKeywords: ['homework', 'project', 'lab', 'due date', 'assignment', 'released', 'spec'],
  },
  office_hours: {
    urlPatterns: [/office/i, /oh\b/i, /hours/i, /staff/i, /schedule/i],
    contentKeywords: ['office hour', 'OH', 'drop-in', 'tutoring', 'help session'],
  },
  staff: {
    urlPatterns: [/staff/i, /people/i, /team/i, /instructor/i, /about/i],
    contentKeywords: ['instructor', 'professor', 'TA', 'tutor', 'reader', 'staff'],
  },
  exams: {
    urlPatterns: [/exam/i, /midterm/i, /final/i, /schedule/i, /policy/i],
    contentKeywords: ['midterm', 'final exam', 'exam date', 'exam time', 'exam location'],
  },
  syllabus: {
    urlPatterns: [/syllabus/i, /schedule/i, /policy/i, /grading/i, /about/i, /course-info/i],
    contentKeywords: ['week', 'topic', 'reading', 'grade', 'weight', 'percent', 'curve', 'clobber', 'drop lowest'],
  },
};

interface PageInput {
  url: string;
  markdown: string;
}

function selectPages(pages: PageInput[], category: ExtractionCategory): PageInput[] {
  const routing = PAGE_ROUTING[category];
  const scored = pages.map((page) => {
    let score = 0;
    // URL pattern matches
    for (const pat of routing.urlPatterns) {
      if (pat.test(page.url)) { score += 10; break; }
    }
    // Content keyword density
    const lowerMd = page.markdown.toLowerCase();
    for (const kw of routing.contentKeywords) {
      const count = lowerMd.split(kw.toLowerCase()).length - 1;
      if (count > 0) score += Math.min(count, 5);
    }
    return { page, score };
  });

  // Always include root (first page)
  const root = pages[0];
  const highScoring = scored
    .filter((s) => s.score >= 2 && s.page !== root)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.page);

  if (highScoring.length === 0) {
    // Fallback: use all pages
    return pages;
  }

  // Root + top 5 scoring pages (deduplicated)
  const selected = [root, ...highScoring.filter((p) => p !== root)];
  return selected;
}

function buildContent(pages: PageInput[], maxChars: number = 500_000): string {
  let totalChars = pages.reduce((s, p) => s + p.markdown.length, 0);

  // If over budget, truncate longest pages
  let truncatedPages = pages;
  if (totalChars > maxChars) {
    const PER_PAGE_CAP = 30_000;
    truncatedPages = pages.map((p) => ({
      url: p.url,
      markdown: p.markdown.length > PER_PAGE_CAP
        ? p.markdown.slice(0, PER_PAGE_CAP) + '\n\n[... truncated ...]'
        : p.markdown,
    }));
    totalChars = truncatedPages.reduce((s, p) => s + p.markdown.length, 0);
  }

  return truncatedPages
    .map((p) => `--- PAGE: ${p.url} ---\n${p.markdown}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function baseSystemPrompt(courseUrl: string): string {
  return `You are extracting structured course data from a Berkeley course website.
The content below is cleaned markdown from multiple pages of the course website (${courseUrl}).
Each page is separated by a "--- PAGE: <url> ---" header.

IMPORTANT RULES:
- Only extract data for the current semester (Spring 2026). Reject dates from other years.
- When you see a relative URL, the base URL is: ${courseUrl}
- Set confidence to 1.0 when data is explicitly stated on the page.
- Set confidence to 0.7-0.9 when you are inferring from partial information.
- Set confidence below 0.7 when you are guessing or the information is ambiguous.
- If a category has no relevant data on the website, return an empty array.
- Use the provided tool to return your results.`;
}

const CATEGORY_ADDITIONS: Record<ExtractionCategory, string> = {
  assignments: `
Focus on finding assignments, homework, projects, labs, and exams listed on the course website.
- "type" must be one of: homework, project, lab, exam, other
- due_date and release_date should be in ISO 8601 format (YYYY-MM-DD) when found
- spec_url should be the link to the assignment specification/handout if available
- Include source_page_url: the URL of the page where you found this assignment`,

  office_hours: `
Focus on finding office hours, help sessions, tutoring sessions, and drop-in hours.
- day_of_week is 0=Sunday, 1=Monday, ..., 6=Saturday
- start_time and end_time should be in 24-hour format (HH:MM)
- staff_role must be one of: professor, ta, tutor, other
- Include location (room number/building) and zoom_link if available`,

  staff: `
Focus on finding course staff: instructors, TAs, tutors, readers, and other course personnel.
- role should be a descriptive string like "Instructor", "Head TA", "Tutor", "Reader", etc.
- Include email addresses and photo URLs when found on the page
- Do NOT include generic department contacts, only people specifically listed as course staff`,

  exams: `
Focus on finding exam dates, times, and locations.
- Include midterms, finals, quizzes, and any other timed assessments
- date should be in ISO 8601 format (YYYY-MM-DD)
- time should describe the exam time (e.g., "7-9pm", "8:00-10:00 AM")
- Include location/room if specified`,

  syllabus: `
Focus on two things:
1. SYLLABUS SCHEDULE: Extract the weekly course schedule with topics and readings.
2. GRADING POLICY: Extract the grading breakdown if present.

For the grading policy, follow these critical rules:

EXAM GROUPS:
- If a course has multiple exams (midterm 1, midterm 2, final, etc.) create SEPARATE component groups for each exam
- If exams are equally weighted, divide the total exam weight equally: e.g. "36% exams, 3 midterms" → three groups at 12% each
- Never create one combined "Exams" group when individual exams can be identified

ASSIGNMENT NAME PATTERNS for exam groups:
- "Midterm 1" group → patterns: ["midterm 1", "mt1", "mt 1", "exam 1"]
- "Midterm 2" group → patterns: ["midterm 2", "mt2", "mt 2", "exam 2"]
- "Final Exam" group → patterns: ["final", "final exam"]

NON-EXAM GROUPS:
- assignmentNamePatterns should be lowercase substrings that match real assignment names
- For homework: include ["hw", "homework", "written", "problem set"]
- For projects: include ["project", "proj"]
- "Project 0 counts as homework" means Project 0 should be in the Homework group

POINTS-BASED vs PERCENTAGE-BASED:
First determine if the course uses a points-based or percentage-based grading system:
- POINTS-BASED (is_points_based=true): The syllabus lists raw point values for each category (e.g. "Homework: 20 points, Midterm: 55 points, Final: 80 points"). Set total_points to the sum (e.g. 300). Each component_group's weight should be the RAW MAX POINTS for that category (e.g. 25, 55, 80), NOT a fraction. Grade scale cutoffs are in raw points (e.g. A = 285).
- PERCENTAGE-BASED (is_points_based=false): The syllabus lists percentage weights (e.g. "Homework: 20%, Midterm: 30%"). Set total_points to null. Each component_group's weight should be a decimal fraction (0.20, 0.30) that sums to 1.0. Grade scale cutoffs are percentages (e.g. A = 90).

Key signals for points-based: explicit point totals, "out of X points", "N points total", grade bins in raw points.
Key signals for percentage-based: "X% of your grade", weights listed as percentages, no mention of point totals.

WEIGHT RULES:
- percentage-based: weights must sum to 1.0 (convert percentages to decimals)
- points-based: weights are raw max points, must sum to total_points
- grade_scale is null if standard A/B/C/D/F scale is used without explicit cutoffs

CURVE AND CLOBBER:
- is_curved is true if the website mentions curve, z-score, department curve, or grade adjustment
- comparison_type is "zscore" if it mentions "standardized", "curved score", "z-score". Otherwise "raw"
- For clobber policies: source_name is the assignment doing the clobbering, target_name is the one being replaced

DROP POLICIES:
- "drop the lowest" or "drop the lowest score" → drop_lowest=1
- "drop the lowest N" → drop_lowest=N

MULTI-SECTION:
- If the website has BOTH undergrad and grad grading schemes, extract the UNDERGRAD scheme only

If no grading policy is found on the website, set grading_policy to null.`,
};

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

function assignmentsTool(): Anthropic.Messages.Tool {
  return {
    name: 'extract_assignments',
    description: 'Extract all assignments found on the course website',
    input_schema: {
      type: 'object' as const,
      properties: {
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Assignment name as shown on the website' },
              type: { type: 'string', enum: ['homework', 'project', 'lab', 'exam', 'other'] },
              due_date: { type: ['string', 'null'], description: 'ISO 8601 date (YYYY-MM-DD) or null' },
              release_date: { type: ['string', 'null'], description: 'ISO 8601 date or null' },
              spec_url: { type: ['string', 'null'], description: 'URL to assignment spec/handout' },
              source_page_url: { type: 'string', description: 'URL of the page where this was found' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['name', 'type', 'due_date', 'release_date', 'spec_url', 'source_page_url', 'confidence'],
          },
        },
      },
      required: ['assignments'],
    },
  };
}

function officeHoursTool(): Anthropic.Messages.Tool {
  return {
    name: 'extract_office_hours',
    description: 'Extract all office hours found on the course website',
    input_schema: {
      type: 'object' as const,
      properties: {
        office_hours: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              staff_name: { type: 'string' },
              staff_role: { type: 'string', enum: ['professor', 'ta', 'tutor', 'other'] },
              day_of_week: { type: 'number', minimum: 0, maximum: 6, description: '0=Sun, 6=Sat' },
              start_time: { type: 'string', description: 'HH:MM 24hr format' },
              end_time: { type: 'string', description: 'HH:MM 24hr format' },
              location: { type: ['string', 'null'] },
              zoom_link: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['staff_name', 'staff_role', 'day_of_week', 'start_time', 'end_time', 'location', 'zoom_link', 'confidence'],
          },
        },
      },
      required: ['office_hours'],
    },
  };
}

function staffTool(): Anthropic.Messages.Tool {
  return {
    name: 'extract_staff',
    description: 'Extract all course staff found on the course website',
    input_schema: {
      type: 'object' as const,
      properties: {
        staff: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string', description: 'e.g. Instructor, Head TA, Tutor, Reader' },
              email: { type: ['string', 'null'] },
              photo_url: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['name', 'role', 'email', 'photo_url', 'confidence'],
          },
        },
      },
      required: ['staff'],
    },
  };
}

function examsTool(): Anthropic.Messages.Tool {
  return {
    name: 'extract_exams',
    description: 'Extract all exam dates and details found on the course website',
    input_schema: {
      type: 'object' as const,
      properties: {
        exams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'e.g. Midterm 1, Final Exam' },
              date: { type: ['string', 'null'], description: 'ISO 8601 date' },
              time: { type: ['string', 'null'], description: 'e.g. 7-9pm' },
              location: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['name', 'date', 'time', 'location', 'confidence'],
          },
        },
      },
      required: ['exams'],
    },
  };
}

function syllabusAndGradingTool(): Anthropic.Messages.Tool {
  return {
    name: 'extract_syllabus_and_grading',
    description: 'Extract weekly syllabus schedule and grading policy from the course website',
    input_schema: {
      type: 'object' as const,
      properties: {
        syllabus_weeks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              week_num: { type: 'number' },
              topic: { type: 'string' },
              start_date: { type: ['string', 'null'], description: 'ISO 8601 date' },
              readings: { type: ['string', 'null'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['week_num', 'topic', 'start_date', 'readings', 'confidence'],
          },
        },
        grading_policy: {
          type: ['object', 'null'],
          properties: {
            is_points_based: { type: 'boolean', description: 'true if grading uses raw points, false if percentage weights' },
            total_points: { type: ['number', 'null'], description: 'Total points when is_points_based=true (e.g. 300), null otherwise' },
            is_curved: { type: 'boolean' },
            curve_description: { type: ['string', 'null'] },
            component_groups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  weight: { type: 'number', description: 'Points-based: raw max points (e.g. 25, 55). Percentage-based: decimal fraction (e.g. 0.20, 0.30)' },
                  drop_lowest: { type: 'number' },
                  is_best_of: { type: 'boolean' },
                  is_exam: { type: 'boolean' },
                  assignment_name_patterns: { type: 'array', items: { type: 'string' } },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['name', 'weight', 'drop_lowest', 'is_best_of', 'is_exam', 'assignment_name_patterns', 'confidence'],
              },
            },
            clobber_policies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source_name: { type: 'string' },
                  target_name: { type: 'string' },
                  comparison_type: { type: 'string', enum: ['raw', 'zscore'] },
                  condition_text: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['source_name', 'target_name', 'comparison_type', 'condition_text', 'confidence'],
              },
            },
            grade_scale: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                properties: {
                  letter: { type: 'string' },
                  min_score: { type: 'number' },
                  max_score: { type: 'number' },
                  is_points: { type: 'boolean' },
                },
                required: ['letter', 'min_score', 'max_score', 'is_points'],
              },
            },
            notes: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['is_points_based', 'total_points', 'is_curved', 'curve_description', 'component_groups', 'clobber_policies', 'grade_scale', 'notes', 'confidence'],
        },
      },
      required: ['syllabus_weeks', 'grading_policy'],
    },
  };
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

interface CategoryConfig {
  category: ExtractionCategory;
  tool: Anthropic.Messages.Tool;
  maxTokens: number;
  extractKey: string; // key inside tool_use result that holds the array
}

const CATEGORIES: CategoryConfig[] = [
  { category: 'assignments', tool: assignmentsTool(), maxTokens: 4096, extractKey: 'assignments' },
  { category: 'office_hours', tool: officeHoursTool(), maxTokens: 4096, extractKey: 'office_hours' },
  { category: 'staff', tool: staffTool(), maxTokens: 8192, extractKey: 'staff' },
  { category: 'exams', tool: examsTool(), maxTokens: 4096, extractKey: 'exams' },
  { category: 'syllabus', tool: syllabusAndGradingTool(), maxTokens: 8192, extractKey: 'syllabus_weeks' },
];

// ---------------------------------------------------------------------------
// LLM call with retry
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 503]);

async function callLLM(
  client: Anthropic,
  system: string,
  userContent: string,
  tool: Anthropic.Messages.Tool,
  maxTokens: number,
): Promise<{ result: Record<string, unknown>; inputTokens: number; outputTokens: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      });

      const toolBlock = response.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      if (!toolBlock) {
        throw new Error(`No tool_use block in response (stop_reason: ${response.stop_reason})`);
      }

      return {
        result: toolBlock.input as Record<string, unknown>,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      lastError = err as Error;
      // Check if retryable
      const statusMatch = (err as Error).message?.match(/(\d{3})/);
      if (statusMatch && !RETRYABLE_STATUS.has(parseInt(statusMatch[1]))) {
        throw err; // permanent failure, don't retry
      }
      console.warn(`[extractor] LLM call attempt ${attempt + 1} failed: ${(err as Error).message}`);
    }
  }

  throw lastError ?? new Error('LLM call failed');
}

// ---------------------------------------------------------------------------
// Weight sum guard
// ---------------------------------------------------------------------------

function validateGradingPolicy(
  policy: ExtractedGradingPolicy | null,
): ExtractedGradingPolicy | null {
  if (!policy) return null;
  if (!policy.component_groups || policy.component_groups.length === 0) return policy;

  const totalWeight = policy.component_groups.reduce((sum, g) => sum + (g.weight ?? 0), 0);

  if (policy.is_points_based) {
    // Points-based: weights are raw points, must sum to total_points (within 10% tolerance)
    const expectedTotal = policy.total_points;
    if (!expectedTotal || expectedTotal <= 0) {
      console.warn(`[extractor] Weight sum guard: points-based but total_points=${expectedTotal}. Discarding grading policy.`);
      return null;
    }
    const ratio = totalWeight / expectedTotal;
    if (ratio < 0.85 || ratio > 1.15) {
      console.warn(
        `[extractor] Weight sum guard: points sum ${totalWeight} vs total_points ${expectedTotal} (ratio ${ratio.toFixed(3)}). Discarding grading policy.`,
      );
      return null;
    }
  } else {
    // Percentage-based: weights are fractions, must sum to ~1.0
    if (totalWeight < 0.7 || totalWeight > 1.15) {
      console.warn(
        `[extractor] Weight sum guard: got ${totalWeight.toFixed(3)}, expected 0.70–1.15. Discarding grading policy.`,
      );
      return null;
    }
  }

  return policy;
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

export async function extractCourseData(
  pages: PageInput[],
  courseUrl: string,
): Promise<ExtractionResult> {
  const client = new Anthropic();
  const startMs = Date.now();
  const base = baseSystemPrompt(courseUrl);

  const result: ExtractionResult = {
    assignments: [],
    office_hours: [],
    staff: [],
    exams: [],
    syllabus_weeks: [],
    grading_policy: null,
    extraction_meta: {
      model: MODEL,
      categories_attempted: [],
      categories_succeeded: [],
      categories_failed: [],
      per_category: [],
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
      elapsed_ms: 0,
    },
  };

  // Haiku 4.5 pricing (per million tokens)
  const INPUT_COST_PER_MTOK = 0.80;
  const OUTPUT_COST_PER_MTOK = 4.00;

  for (const cfg of CATEGORIES) {
    result.extraction_meta.categories_attempted.push(cfg.category);

    const selectedPages = selectPages(pages, cfg.category);
    const content = buildContent(selectedPages);

    const system = base + '\n' + CATEGORY_ADDITIONS[cfg.category];

    console.log(
      `[extractor] ${cfg.category}: ${selectedPages.length} pages, ${content.length.toLocaleString()} chars`,
    );

    const categoryStartMs = Date.now();

    try {
      const { result: llmResult, inputTokens, outputTokens } = await callLLM(
        client,
        system,
        content,
        cfg.tool,
        cfg.maxTokens,
      );

      const categoryElapsedMs = Date.now() - categoryStartMs;
      const categoryCost =
        (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK +
        (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK;

      result.extraction_meta.total_input_tokens += inputTokens;
      result.extraction_meta.total_output_tokens += outputTokens;
      result.extraction_meta.total_cost_usd += categoryCost;
      result.extraction_meta.per_category.push({
        category: cfg.category,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: Math.round(categoryCost * 1_000_000) / 1_000_000, // 6 decimal places
        elapsed_ms: categoryElapsedMs,
      });

      // Map results to the output structure
      switch (cfg.category) {
        case 'assignments':
          result.assignments = (llmResult.assignments as ExtractedAssignment[]) ?? [];
          break;
        case 'office_hours':
          result.office_hours = (llmResult.office_hours as ExtractedOfficeHour[]) ?? [];
          break;
        case 'staff':
          result.staff = (llmResult.staff as ExtractedStaff[]) ?? [];
          break;
        case 'exams':
          result.exams = (llmResult.exams as ExtractedExam[]) ?? [];
          break;
        case 'syllabus': {
          result.syllabus_weeks = (llmResult.syllabus_weeks as ExtractedSyllabusWeek[]) ?? [];
          const rawPolicy = llmResult.grading_policy as ExtractedGradingPolicy | null;
          result.grading_policy = validateGradingPolicy(rawPolicy);
          break;
        }
      }

      const count = cfg.category === 'syllabus'
        ? `${result.syllabus_weeks.length} weeks${result.grading_policy ? ' + grading' : ''}`
        : `${(llmResult[cfg.extractKey] as unknown[])?.length ?? 0} items`;
      console.log(
        `[extractor] ${cfg.category}: ${count} — ` +
          `${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out, ` +
          `$${categoryCost.toFixed(4)}, ${(categoryElapsedMs / 1000).toFixed(1)}s`,
      );

      result.extraction_meta.categories_succeeded.push(cfg.category);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[extractor] ${cfg.category} failed: ${msg}`);
      result.extraction_meta.categories_failed.push({ category: cfg.category, error: msg });
    }
  }

  result.extraction_meta.elapsed_ms = Date.now() - startMs;
  result.extraction_meta.total_cost_usd = Math.round(result.extraction_meta.total_cost_usd * 1_000_000) / 1_000_000;
  return result;
}
