import { PDFParse } from 'pdf-parse';

const CANVAS_BASE = 'https://bcourses.berkeley.edu/api/v1';

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

// Fetch syllabus from Canvas syllabus_body endpoint
export async function fetchCanvasSyllabus(
  canvasId: string,
  canvasToken: string
): Promise<string | null> {
  try {
    // First try the syllabus body endpoint
    const syllabusRes = await fetch(
      `${CANVAS_BASE}/courses/${canvasId}?include[]=syllabus_body`,
      {
        headers: { Authorization: `Bearer ${canvasToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (syllabusRes.ok) {
      const data = (await syllabusRes.json()) as { syllabus_body?: string };
      const syllabusHtml = data.syllabus_body?.trim() ?? '';

      // If syllabus body contains PDF links, follow them
      // Canvas PDF links use data-api-endpoint with .pdf in title/text, not in the URL
      if (syllabusHtml && syllabusHtml.toLowerCase().includes('.pdf')) {
        // Strategy 1: Match href URLs that end in .pdf
        let pdfUrl: string | null = null;
        const directPdfMatch = syllabusHtml.match(/href=["']([^"']*\.pdf[^"']*)/i);
        if (directPdfMatch) {
          pdfUrl = directPdfMatch[1];
        }

        // Strategy 2: Match Canvas file API endpoints (data-api-endpoint)
        // These look like: data-api-endpoint="https://bcourses.../api/v1/courses/X/files/Y"
        // Try all matches since the first might be an image, not a PDF
        if (!pdfUrl) {
          const apiEndpointMatches = [...syllabusHtml.matchAll(
            /data-api-endpoint=["'](https:\/\/bcourses[^"']*\/files\/\d+)["']/gi
          )];
          for (const match of apiEndpointMatches) {
            try {
              const fileApiUrl = match[1];
              const fileRes = await fetch(fileApiUrl, {
                headers: { Authorization: `Bearer ${canvasToken}` },
                signal: AbortSignal.timeout(10000),
              });
              if (fileRes.ok) {
                const fileData = (await fileRes.json()) as { url?: string; 'content-type'?: string; filename?: string };
                // Only use if it's a PDF file
                if (fileData.url && (
                  fileData['content-type']?.includes('pdf') ||
                  fileData.filename?.toLowerCase().endsWith('.pdf')
                )) {
                  pdfUrl = fileData.url;
                  break;
                }
              }
            } catch (e) {
              console.error('[syllabus] Canvas file API error:', e);
            }
          }
        }

        // Strategy 3: Match Canvas file download links with verifier params
        if (!pdfUrl) {
          const canvasFileMatch = syllabusHtml.match(
            /href=["'](https:\/\/bcourses[^"']*\/files\/\d+[^"']*)/i
          );
          if (canvasFileMatch) {
            // Convert wrap URL to download URL
            pdfUrl = canvasFileMatch[1].replace(/[?&]wrap=1/, '').replace(/\?$/, '');
            if (!pdfUrl.includes('/download')) {
              pdfUrl += (pdfUrl.includes('?') ? '&' : '?') + 'download=1';
            }
          }
        }

        if (pdfUrl) {
          if (pdfUrl.startsWith('/')) {
            pdfUrl = `https://bcourses.berkeley.edu${pdfUrl}`;
          }
          try {
            const pdfRes = await fetch(pdfUrl, {
              headers: { Authorization: `Bearer ${canvasToken}` },
              signal: AbortSignal.timeout(15000),
              redirect: 'follow',
            });
            if (pdfRes.ok) {
              const buffer = await pdfRes.arrayBuffer();
              const text = await extractTextFromPdf(buffer);
              if (text.length > 200) {
                console.log(`[syllabus] Extracted ${text.length} chars from PDF link in syllabus body`);
                return text;
              }
            }
          } catch (e) {
            console.error('[syllabus] PDF follow error:', e);
          }
        }
      }

      if (syllabusHtml.length > 100) {
        return syllabusHtml;
      }
    }

    // Fall back to Canvas files — look for a file named "syllabus"
    const filesRes = await fetch(
      `${CANVAS_BASE}/courses/${canvasId}/files?search_term=syllabus&per_page=5`,
      {
        headers: { Authorization: `Bearer ${canvasToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!filesRes.ok) return null;
    const files = (await filesRes.json()) as { url: string; updated_at: string }[];
    if (!files.length) return null;

    // Get the most recent syllabus file
    const syllabusFile = files.sort(
      (a: any, b: any) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];

    // Download the file
    const fileRes = await fetch(syllabusFile.url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!fileRes.ok) return null;

    const contentType = fileRes.headers.get('content-type') ?? '';

    // Handle PDF — extract text via pdf-parse
    if (contentType.includes('pdf')) {
      const buffer = await fileRes.arrayBuffer();
      return await extractTextFromPdf(buffer);
    }

    // HTML or plain text
    return await fileRes.text();
  } catch (error) {
    console.error('[syllabus] Canvas fetch error:', error);
    return null;
  }
}

// Fetch syllabus from course website URL
export async function fetchWebsiteSyllabus(
  websiteUrl: string
): Promise<string | null> {
  const base = websiteUrl.replace(/\/$/, '');

  // Try these paths in order — ranked by hit rate across Berkeley course sites
  // CS 162 uses /policies, CS 189 uses /syllabus/
  const candidatePaths = [
    '/syllabus/',  // CS 189 pattern (Jekyll/Just the Docs sites)
    '/syllabus',   // without trailing slash
    '/policies',   // CS 162 pattern (Bootstrap sites)
    '',            // root — some sites put everything on one page
    '/grading',    // direct grading page
    '/course-info',
    '/about',
    '/course',
    '/info',
  ];

  const gradingKeywords = [
    'grade', 'weight', 'percent', 'homework', 'midterm',
    'final', 'points', 'curve', 'grading', 'distribution',
    'clobber', 'slip', 'drop lowest', 'z-score',
    'participation', 'component', 'category', 'scheme',
    'equally weighted', 'curved scale', 'department policy',
  ];

  // Heading IDs/text that strongly signal grading content
  const gradingHeadingPatterns = [
    'id="grading"',          // CS 162
    'id="grading-scheme"',   // CS 189
    'id="grade-breakdown"',
    'id="grade-distribution"',
    'id="assessment"',
  ];

  let bestResult: string | null = null;
  let bestScore = 0;

  for (const path of candidatePaths) {
    try {
      const url = base + path;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Jarvis/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const lower = html.toLowerCase();

      // Base score: count grading keyword occurrences
      let score = gradingKeywords.reduce(
        (s, k) => s + (lower.split(k).length - 1), 0
      );

      // Bonus: heading with grading-related id attribute (+10)
      for (const pattern of gradingHeadingPatterns) {
        if (lower.includes(pattern)) {
          score += 10;
          break;
        }
      }

      // Bonus: table containing percentage values near "grade" (+5)
      if (lower.includes('<table') && /\d+%/.test(html)) {
        const tableMatch = lower.match(/<table[\s\S]*?<\/table>/);
        if (tableMatch && /grade|category|component|weight/.test(tableMatch[0])) {
          score += 5;
        }
      }

      // Bonus: list items with percentage pattern (+3)
      const pctListItems = (lower.match(/<li>[^<]*\d+%[^<]*<\/li>/g) || []).length;
      if (pctListItems >= 3) score += 3;

      console.log(`[syllabus] ${url} — keyword score: ${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestResult = html;
      }

      // High-confidence match — stop searching
      if (score >= 15) break;
    } catch {
      continue;
    }
  }

  if (bestScore < 2 || !bestResult) return null;

  // Extract grading-relevant sections to avoid truncation in the LLM
  // Long pages (like CS 189 at 49k chars) may have the grade table past the 15k limit
  return extractGradingSections(bestResult);
}

// Extract sections of HTML that contain grading information.
// This prevents the 15k LLM context truncation from cutting off grade tables
// that appear late in long pages (e.g. CS 189 syllabus is 49k chars).
function extractGradingSections(html: string): string {
  const lower = html.toLowerCase();

  // Strategy 1: Find grading-related headings and extract surrounding content
  const headingPatterns = [
    // ID-based (most reliable)
    /(<h[1-6][^>]*id="(?:grading|grading-scheme|grade-breakdown|assessment|policies)[^"]*"[\s\S]*?)(?=<h[1-6][ >]|$)/gi,
    // Text-based
    /(<h[1-6][^>]*>[\s\S]*?(?:grading|grade breakdown|grade scheme|assessment)[\s\S]*?<\/h[1-6]>[\s\S]*?)(?=<h[1-6][ >]|$)/gi,
  ];

  const sections: string[] = [];
  const seen = new Set<number>();

  for (const pattern of headingPatterns) {
    for (const match of html.matchAll(pattern)) {
      const start = match.index!;
      // Skip if we've already captured a section starting near here
      if ([...seen].some(s => Math.abs(s - start) < 200)) continue;
      seen.add(start);
      // Take up to 3000 chars from this heading
      sections.push(html.slice(start, start + 3000));
    }
  }

  // Strategy 2: Find tables with percentage values
  for (const match of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    if (/\d+%/.test(match[0]) && /category|component|weight|grade|homework|midterm|final/i.test(match[0])) {
      const start = match.index!;
      if ([...seen].some(s => Math.abs(s - start) < 200)) continue;
      seen.add(start);
      // Include 500 chars before table (heading context) and the full table
      sections.push(html.slice(Math.max(0, start - 500), start + match[0].length + 500));
    }
  }

  // Strategy 3: Find <ul> with percentage list items
  for (const match of html.matchAll(/<ul>[\s\S]*?<\/ul>/gi)) {
    const pctItems = (match[0].match(/<li>[^<]*\d+%[^<]*<\/li>/gi) || []).length;
    if (pctItems >= 3) {
      const start = match.index!;
      if ([...seen].some(s => Math.abs(s - start) < 200)) continue;
      seen.add(start);
      sections.push(html.slice(Math.max(0, start - 500), start + match[0].length + 500));
    }
  }

  if (sections.length > 0) {
    const extracted = sections.join('\n\n<!-- section break -->\n\n');
    console.log(`[syllabus] Extracted ${sections.length} grading sections (${extracted.length} chars from ${html.length} total)`);
    return extracted;
  }

  // Fallback: return the full HTML (let the extractor truncate)
  return html;
}
