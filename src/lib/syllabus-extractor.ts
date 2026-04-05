import { config } from 'dotenv';
config({ override: true });
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export interface ExtractedClobberPolicy {
  sourceName: string;
  targetName: string;
  comparisonType: 'raw' | 'zscore';
  conditionText: string;
}

export interface ExtractedComponentGroup {
  name: string;
  weight: number; // 0.0–1.0
  dropLowest: number;
  isBestOf: boolean;
  isExam: boolean;
  assignmentNamePatterns: string[]; // patterns to match against assignment names
}

export interface ExtractedGradeScale {
  letter: string;
  minScore: number;
  maxScore: number;
  isPoints: boolean;
}

export interface ExtractedSyllabus {
  isCurved: boolean;
  curveDescription: string | null;
  componentGroups: ExtractedComponentGroup[];
  gradeScale: ExtractedGradeScale[] | null;
  clobberPolicies: ExtractedClobberPolicy[];
  notes: string; // anything ambiguous the LLM flagged
}

const SYSTEM_PROMPT = `You are a precise academic syllabus parser. Extract grading structure from course syllabi.

Return ONLY valid JSON matching this exact schema — no markdown, no preamble:
{
  "isCurved": boolean,
  "curveDescription": string | null,
  "componentGroups": [
    {
      "name": string,
      "weight": number (0.0 to 1.0),
      "dropLowest": number (0 if not mentioned),
      "isBestOf": boolean,
      "isExam": boolean,
      "assignmentNamePatterns": string[]
    }
  ],
  "gradeScale": [...] | null,
  "clobberPolicies": [
    {
      "sourceName": string (the assignment doing the clobbering),
      "targetName": string (the assignment being replaced),
      "comparisonType": "raw" | "zscore",
      "conditionText": string (exact quote from syllabus)
    }
  ],
  "notes": string
}

CRITICAL RULES FOR EXAM GROUPS:
- If a course has multiple exams (midterm 1, midterm 2, final, etc.) create SEPARATE component groups for each exam
- If exams are equally weighted, divide the total exam weight equally: e.g. "36% exams, 3 midterms" → three groups at 12% each
- If a course has NO final exam (explicitly stated), do not create a Final Exam group
- Never create one combined "Exams" group when individual exams can be identified
- For "3 midterms, each holds equal weight, 36% total" → "Midterm 1" 12%, "Midterm 2" 12%, "Midterm 3" 12%
- For "Midterm 30%, Final 40%" → separate "Midterm Exam" 30% and "Final Exam" 40% groups

ASSIGNMENT NAME PATTERNS for exam groups:
- "Midterm 1" group → patterns: ["midterm 1", "mt1", "mt 1", "exam 1"]
- "Midterm 2" group → patterns: ["midterm 2", "mt2", "mt 2", "exam 2"]
- "Midterm 3" group → patterns: ["midterm 3", "mt3", "mt 3", "exam 3"]
- "Final Exam" group → patterns: ["final", "final exam"]

RULES FOR NON-EXAM GROUPS:
- "Project 0 counts as homework" means Project 0 should be in the Homework group, not Projects
- assignmentNamePatterns should be lowercase substrings that match real assignment names
- For homework: include ["hw", "homework", "written", "problem set"]
- For projects: include ["project", "proj"] but NOT "project 0" if it's counted as homework
- isCurved is true if syllabus mentions curve, z-score, department curve, or grade adjustment

OTHER RULES:
- weights must sum to 1.0 across all componentGroups
- if weights are given as points convert to fractions
- gradeScale is null if standard A/B/C/D/F scale is used without explicit cutoffs
- notes: flag any ambiguities or unusual policies
- comparisonType is "zscore" if syllabus mentions "standardized", "curved score", "z-score", or implies comparing performance relative to class. Otherwise "raw"
- isExam is true for: midterm, final, exam, quiz, test

Multi-section courses:
- If the syllabus has BOTH undergrad and grad grading schemes (e.g., "CS 189" vs "CS 289A"), extract the UNDERGRAD scheme only
- Grad-only components should be excluded

Drop policies:
- "drop the lowest" or "drop the lowest score" → dropLowest=1
- "drop the lowest N" → dropLowest=N

Clobber policies:
- "final to clobber the midterm via Z-score" → sourceName="Final Exam", targetName="Midterm Exam", comparisonType="zscore"
- "final replaces midterm if higher" → comparisonType="raw"`;

export async function extractSyllabus(
  rawText: string,
  courseCode: string
): Promise<ExtractedSyllabus> {
  // Truncate to 25k chars — the fetcher pre-extracts grading sections,
  // but some syllabi have multiple relevant sections that total >15k
  const truncated = rawText.slice(0, 25000);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Parse the grading structure from this ${courseCode} syllabus:\n\n${truncated}`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  let text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  // Strip markdown code fences if present (```json ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(text) as ExtractedSyllabus;
  } catch {
    console.error('[syllabus] LLM returned invalid JSON:', text.slice(0, 200));
    throw new Error('Syllabus extraction failed — invalid JSON from LLM');
  }
}
