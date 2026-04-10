// Standalone course-website pipeline test script.
//
// Crawls a root URL + same-origin links one level deep, cleans HTML to
// markdown, then (if ANTHROPIC_API_KEY is set) runs 5 Haiku tool_use calls
// to extract structured course data.
//
// Usage:
//   npx tsx src/scripts/test-website-crawler.ts <url>
//
// Output: apps/pipeline/output/website-crawler/{hostname}-{timestamp}.json

import { config } from 'dotenv';
config({ override: true });

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crawlSite, type CrawlSummary } from '../lib/website-crawler';
import { extractCourseData, type ExtractionResult } from '../lib/course-extractor';

interface ExtractorOutput {
  rootUrl: string;
  fetchedAt: string;
  extractedAt: string;
  pageCount: number;
  crawl_summary: CrawlSummary;
  extraction: ExtractionResult;
}

function sanitizeForFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9.-]+/g, '_').replace(/^_+|_+$/g, '');
}

async function main() {
  const inputUrl = process.argv[2];
  if (!inputUrl) {
    console.error('Usage: npx tsx src/scripts/test-website-crawler.ts <url>');
    process.exit(1);
  }

  let rootUrl: URL;
  try {
    rootUrl = new URL(inputUrl);
  } catch {
    console.error(`[crawler] invalid URL: ${inputUrl}`);
    process.exit(1);
  }

  const startedAt = new Date();
  console.log(`[crawler] root: ${rootUrl.toString()}`);

  // Step 1: crawl site
  const { results: crawled, summary: crawlSummary } = await crawlSite(rootUrl.toString());

  console.log(
    `[crawler] crawl done: ${crawlSummary.total} pages — ` +
      `${crawlSummary.ok} ok, ${crawlSummary.failed} failed, ` +
      `${crawlSummary.jsShellSuspected} js-shell, ${crawlSummary.authWalled} auth-walled`,
  );

  // Step 2: LLM extraction (if API key is set)
  const outputDir = path.resolve(__dirname, '..', '..', 'output', 'website-crawler');
  await mkdir(outputDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const filename = `${sanitizeForFilename(rootUrl.hostname)}-${stamp}.json`;
  const outputPath = path.join(outputDir, filename);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[crawler] ANTHROPIC_API_KEY not set — skipping LLM extraction, writing crawl-only output');
    await writeFile(outputPath, JSON.stringify({ rootUrl: rootUrl.toString(), fetchedAt: startedAt.toISOString(), crawl_summary: crawlSummary, extraction: null }, null, 2), 'utf8');
    console.log(`  → ${path.relative(process.cwd(), outputPath)}`);
    return;
  }

  // Build page inputs for extractor — filter out failed/auth-walled pages
  const extractablePages = crawled
    .filter((c) => c.status === 'ok' || c.status === 'js-shell-suspected')
    .filter((c) => c.markdown.length > 0)
    .map((c) => ({ url: c.url, markdown: c.markdown }));

  if (extractablePages.length === 0) {
    console.warn('[crawler] no extractable pages (all auth-walled or failed) — skipping LLM extraction');
    await writeFile(outputPath, JSON.stringify({ rootUrl: rootUrl.toString(), fetchedAt: startedAt.toISOString(), crawl_summary: crawlSummary, extraction: null }, null, 2), 'utf8');
    console.log(`  → ${path.relative(process.cwd(), outputPath)}`);
    return;
  }

  console.log(`[crawler] sending ${extractablePages.length} pages to LLM extraction...`);
  const extraction = await extractCourseData(extractablePages, rootUrl.toString());
  const extractedAt = new Date();

  // Log extraction summary
  const gradingDesc = extraction.grading_policy
    ? `grading (${extraction.grading_policy.is_curved ? 'curved' : 'not curved'}, ${extraction.grading_policy.component_groups.length} groups)`
    : 'no grading';
  console.log(
    `[extractor] done: ${extraction.assignments.length} assignments, ` +
      `${extraction.office_hours.length} OH, ${extraction.staff.length} staff, ` +
      `${extraction.exams.length} exams, ${extraction.syllabus_weeks.length} syllabus weeks, ${gradingDesc}`,
  );
  if (extraction.extraction_meta.categories_failed.length > 0) {
    console.warn(
      `[extractor] failed categories: ${extraction.extraction_meta.categories_failed.map((f) => f.category).join(', ')}`,
    );
  }

  // Step 3: write output — only extracted data
  const output: ExtractorOutput = {
    rootUrl: rootUrl.toString(),
    fetchedAt: startedAt.toISOString(),
    extractedAt: extractedAt.toISOString(),
    pageCount: crawled.length,
    crawl_summary: crawlSummary,
    extraction,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');

  const meta = extraction.extraction_meta;
  console.log(
    `[crawler] output: ${path.relative(process.cwd(), outputPath)}\n` +
      `  ${meta.total_input_tokens.toLocaleString()} input + ${meta.total_output_tokens.toLocaleString()} output tokens\n` +
      `  LLM cost: $${meta.total_cost_usd.toFixed(4)}\n` +
      `  extraction time: ${(meta.elapsed_ms / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error('[crawler] fatal:', err);
  process.exit(1);
});
