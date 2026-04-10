const CANVAS_BASE = 'https://bcourses.berkeley.edu/api/v1';

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // Dynamic import to avoid crashing at startup — pdf-parse v2 loads pdfjs-dist
  // which tries to polyfill browser APIs (DOMMatrix, ImageData, Path2D) at module load
  const { PDFParse } = await import('pdf-parse');
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
