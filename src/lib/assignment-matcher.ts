import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export interface GroupDefinition {
  id: string;
  name: string;
  weight: number;
  isExam: boolean;
}

export interface AssignmentToMatch {
  id: string;
  name: string;
  assignmentType: string | null;
}

export interface MatchResult {
  assignmentId: string;
  componentGroupId: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

// Synonym map — covers Berkeley course naming conventions
const SYNONYMS: Record<string, string[]> = {
  homework: [
    'hw', 'pset', 'problem set', 'pool', 'chapter',
    'on your own', 'concept exercise', 'written', 'worksheet',
    'reading',
  ],
  project: [
    'proj', 'lab', 'programming', 'coding', 'implementation',
    'design doc', 'report', 'checkpoint',
  ],
  exam: [
    'midterm', 'final', 'mt1', 'mt2', 'mt 1', 'mt 2',
    'quiz', 'test', 'exam',
  ],
  participation: [
    'section', 'attendance', 'guest', 'panelist',
    'contribution', 'teamwork', 'peer eval', 'peer review',
    'gsi',
  ],
  discussion: [
    'discussion', 'board', 'forum', 'post', 'thread',
  ],
  cases: ['case', 'hbs', 'harvard business'],
  quizzes: ['quiz', 'chapter quiz'],
};

/**
 * Score how well an assignment matches a group.
 * Higher score = better match. Returns 0 if no match signals found.
 */
function scoreMatch(
  assignmentName: string,
  assignmentType: string | null,
  group: GroupDefinition,
): number {
  const nameLower = assignmentName.toLowerCase();
  const groupLower = group.name.toLowerCase();
  let score = 0;

  // Direct group name word match
  const groupWords = groupLower.split(/\s+/);
  for (const word of groupWords) {
    if (word.length >= 2 && nameLower.includes(word)) score += 3;
  }

  // Assignment type alignment
  if (group.isExam && assignmentType === 'exam') score += 5;
  if (!group.isExam && assignmentType === 'project' && groupLower.includes('project')) score += 4;

  // Numbered exam matching — "Midterm" → "Exam #1", "Midterm 1" → "Exam #1"
  if (group.isExam) {
    const groupNum = groupLower.match(/#?(\d)/)?.[1];
    const assignNum = nameLower.match(/(?:midterm|mt|exam)\s*#?(\d)/)?.[1];

    if (groupNum && assignNum && groupNum === assignNum) {
      score += 10; // Strong signal: number matches
    } else if (groupNum === '1' && !assignNum && /midterm/i.test(nameLower) && !/final/i.test(nameLower)) {
      // "Midterm" (no number) → first exam group
      score += 5;
    } else if (groupNum && assignNum && groupNum !== assignNum) {
      score -= 10; // Penalty: wrong exam number
    }
  }

  // Synonym expansion: check if group category matches assignment via synonyms
  for (const [category, synonyms] of Object.entries(SYNONYMS)) {
    const groupMatchesCategory =
      groupLower.includes(category) ||
      synonyms.some((s) => groupLower.includes(s));
    const assignmentMatchesSynonym = synonyms.some(
      (s) => s.length >= 2 && nameLower.includes(s),
    );

    if (groupMatchesCategory && assignmentMatchesSynonym) score += 2;
  }

  return score;
}

/**
 * Phase 1: Synonym-aware scoring — no LLM cost.
 * Scores every assignment against every group, picks the best match.
 */
export function substringMatch(
  assignments: AssignmentToMatch[],
  groups: GroupDefinition[],
): { matched: MatchResult[]; unmatched: AssignmentToMatch[] } {
  const matched: MatchResult[] = [];
  const unmatched: AssignmentToMatch[] = [];

  for (const assignment of assignments) {
    const scores = groups.map((g) => ({
      group: g,
      score: scoreMatch(assignment.name, assignment.assignmentType, g),
    }));

    const best = scores.reduce((a, b) => (a.score > b.score ? a : b));

    if (best.score >= 2) {
      matched.push({
        assignmentId: assignment.id,
        componentGroupId: best.group.id,
        confidence: best.score >= 5 ? 'high' : 'medium',
        reasoning: `synonym match (score ${best.score})`,
      });
    } else {
      unmatched.push(assignment);
    }
  }

  return { matched, unmatched };
}

/**
 * Phase 2: LLM batch matching — ONE Haiku call per course for all unmatched.
 * Only called when Phase 1 leaves unmatched assignments.
 */
export async function llmBatchMatch(
  unmatched: AssignmentToMatch[],
  groups: GroupDefinition[],
  courseCode: string,
): Promise<MatchResult[]> {
  if (unmatched.length === 0) return [];

  console.log(
    `[matcher] LLM call for ${unmatched.length} unmatched in ${courseCode}`,
  );

  const groupList = groups
    .map((g) => `"${g.name}"(${(g.weight * 100).toFixed(0)}%)`)
    .join(', ');

  const assignmentList = unmatched
    .map((a, i) => `${i + 1}.[${a.assignmentType ?? '?'}]"${a.name}"`)
    .join('\n');

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `Match ${courseCode} assignments to grade component groups. Return only JSON array, no markdown.
Groups: ${groupList}
Rules:
- "Chapter X-POOL" or "On your own" = homework pool
- "Section X" = attendance/participation
- "Academic Integrity" = null (not a real graded assignment)
- Match by educational purpose, not just name similarity
- Return null group for junk/admin assignments`,
      messages: [
        {
          role: 'user',
          content: `${assignmentList}\n\nReturn:[{"i":1,"g":"exact group name or null","c":"high|medium|low"}]`,
        },
      ],
    });
  } catch (error) {
    console.error('[matcher] Anthropic API error:', error);
    return unmatched.map((a) => ({
      assignmentId: a.id,
      componentGroupId: null,
      confidence: 'low' as const,
      reasoning: 'API error',
    }));
  }

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .replace(/```json?\n?|\n?```/g, '')
    .trim();

  let results: { i: number; g: string | null; c: string }[];
  try {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    results = JSON.parse(arrayMatch?.[0] ?? text);
  } catch {
    console.error('[matcher] JSON parse error:', text.slice(0, 300));
    return unmatched.map((a) => ({
      assignmentId: a.id,
      componentGroupId: null,
      confidence: 'low' as const,
      reasoning: 'parse error',
    }));
  }

  return results
    .map((r) => {
      const assignment = unmatched[r.i - 1];
      if (!assignment) return null;

      // Case-insensitive group name matching with fallback to includes
      const group = r.g
        ? (groups.find(
            (g) => g.name.toLowerCase() === r.g!.toLowerCase(),
          ) ??
          groups.find((g) =>
            g.name.toLowerCase().includes(r.g!.toLowerCase()),
          ))
        : null;

      return {
        assignmentId: assignment.id,
        componentGroupId: group?.id ?? null,
        confidence: (r.c as 'high' | 'medium' | 'low') ?? 'medium',
        reasoning: r.g ?? 'no match',
      };
    })
    .filter((r): r is MatchResult => r !== null);
}

/**
 * Main entry — runs Phase 1 (synonym matching), then Phase 2 (LLM) for leftovers.
 */
export async function matchAssignmentsToGroups(
  assignments: AssignmentToMatch[],
  groups: GroupDefinition[],
  courseCode: string,
): Promise<MatchResult[]> {
  if (assignments.length === 0 || groups.length === 0) return [];

  const { matched, unmatched } = substringMatch(assignments, groups);

  console.log(
    `[matcher] ${courseCode}: ${matched.length} synonym, ${unmatched.length} need LLM`,
  );

  const llmResults =
    unmatched.length > 0
      ? await llmBatchMatch(unmatched, groups, courseCode)
      : [];

  const all = [...matched, ...llmResults];

  // Summary log
  const successCount = all.filter((r) => r.componentGroupId).length;
  console.log(
    `[matcher] ${courseCode}: ${successCount}/${assignments.length} matched total`,
  );
  for (const r of all) {
    const group = groups.find((g) => g.id === r.componentGroupId);
    const a = assignments.find((x) => x.id === r.assignmentId);
    if (group) {
      console.log(`  + "${a?.name}" -> ${group.name} (${r.confidence})`);
    } else {
      console.log(`  - "${a?.name}" -> unmatched`);
    }
  }

  return all;
}
