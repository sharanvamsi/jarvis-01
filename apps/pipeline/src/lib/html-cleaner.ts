// HTML → markdown cleaner for course website content.
//
// Designed for two goals:
//   1. Produce clean, readable markdown that fits in Haiku's context window
//      (~70-85% size reduction from raw HTML).
//   2. Be **hash-stable**: the output should only change when the *content*
//      changes, not when chrome/timestamps/build IDs change.
//
// What gets STRIPPED (not content-bearing):
//   - <script>, <style>, <noscript>, <svg>, <iframe>
//   - <nav>, <header>, <footer> (site chrome, not course content)
//   - HTML comments (often contain build timestamps)
//   - <meta> tags
//   - Attribute noise: class, id, style, data-*, onclick, etc.
//   - "Last updated" / "Last modified" lines in visible text
//   - Repeated whitespace / blank lines
//
// What gets KEPT (content-bearing):
//   - All text content inside <main>, <article>, <section>, <div>
//   - <table> structure (converted to markdown tables)
//   - <a href="..."> links (preserved inline as markdown links)
//   - <img src="..." alt="..."> (preserved as markdown images)
//   - <time> tags (may contain assignment dates)
//   - Headings, lists, paragraphs, bold, italic, code

import { parse as parseHtml, HTMLElement, TextNode, NodeType } from 'node-html-parser';

const STRIP_TAGS = new Set([
  'script', 'style', 'noscript', 'svg', 'iframe', 'nav', 'header', 'footer',
  'meta', 'link', 'head',
]);

const BLOCK_TAGS = new Set([
  'div', 'p', 'section', 'article', 'main', 'blockquote', 'pre',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'figure', 'figcaption', 'details', 'summary',
  'form', 'fieldset',
  'hr', 'br',
  'address',
]);

const HEADING_TAGS: Record<string, string> = {
  h1: '#', h2: '##', h3: '###', h4: '####', h5: '#####', h6: '######',
};

// Patterns in visible text that indicate noise, not content
const NOISE_TEXT_PATTERNS = [
  /last\s+(?:updated|modified|built|generated)[:\s]+[^\n]+/gi,
  /©\s*\d{4}/g,
  /all\s+rights\s+reserved/gi,
  /powered\s+by\s+\w+/gi,
];

export interface CleanedPage {
  url: string;
  markdown: string;
  charCount: number;
}

/**
 * Convert raw HTML into clean markdown suitable for LLM extraction.
 * The output is deterministic for the same meaningful content — safe to hash
 * for change detection.
 */
export function cleanHtml(html: string, pageUrl: string): CleanedPage {
  const root = parseHtml(html, {
    comment: false,        // strip HTML comments
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
      pre: true,           // preserve whitespace in <pre>
    },
  });

  // Remove stripped tags
  for (const tag of STRIP_TAGS) {
    for (const el of root.querySelectorAll(tag)) {
      el.remove();
    }
  }

  // Resolve relative URLs in href/src against the page URL
  const base = new URL(pageUrl);

  const lines: string[] = [];
  walkNode(root, lines, base, false);

  let markdown = lines.join('\n');

  // Strip noise patterns from visible text
  for (const pattern of NOISE_TEXT_PATTERNS) {
    markdown = markdown.replace(pattern, '');
  }

  // Normalize whitespace: collapse 3+ blank lines to 2
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

  return {
    url: pageUrl,
    markdown,
    charCount: markdown.length,
  };
}

function resolveUrl(raw: string | undefined, base: URL): string {
  if (!raw) return '';
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

function walkNode(
  node: HTMLElement | TextNode,
  lines: string[],
  base: URL,
  insidePre: boolean,
): void {
  // Text node
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = (node as TextNode).rawText;
    if (insidePre) {
      lines.push(text);
    } else {
      const cleaned = text.replace(/\s+/g, ' ');
      if (cleaned.trim()) {
        lines.push(cleaned);
      }
    }
    return;
  }

  if (!(node instanceof HTMLElement)) return;

  const tag = node.tagName?.toLowerCase();
  if (!tag) {
    // Root or fragment — just recurse
    for (const child of node.childNodes) {
      walkNode(child as HTMLElement | TextNode, lines, base, insidePre);
    }
    return;
  }

  // Skip stripped tags (shouldn't be here after removal, but just in case)
  if (STRIP_TAGS.has(tag)) return;

  // --- Handle specific tags ---

  // Headings
  if (HEADING_TAGS[tag]) {
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push('');
      lines.push(`${HEADING_TAGS[tag]} ${text}`);
      lines.push('');
    }
    return;
  }

  // Links
  if (tag === 'a') {
    const href = resolveUrl(node.getAttribute('href'), base);
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text && href && !href.startsWith('javascript:') && !href.startsWith('mailto:')) {
      lines.push(`[${text}](${href})`);
    } else if (text) {
      lines.push(text);
    }
    return;
  }

  // Images
  if (tag === 'img') {
    const src = resolveUrl(node.getAttribute('src'), base);
    const alt = node.getAttribute('alt') ?? '';
    if (src) {
      lines.push(`![${alt}](${src})`);
    }
    return;
  }

  // Tables
  if (tag === 'table') {
    const tableMarkdown = convertTable(node, base);
    if (tableMarkdown) {
      lines.push('');
      lines.push(tableMarkdown);
      lines.push('');
    }
    return;
  }

  // Pre / code blocks
  if (tag === 'pre') {
    lines.push('');
    lines.push('```');
    for (const child of node.childNodes) {
      walkNode(child as HTMLElement | TextNode, lines, base, true);
    }
    lines.push('```');
    lines.push('');
    return;
  }

  // Inline code
  if (tag === 'code' && !insidePre) {
    const text = node.text.trim();
    if (text) {
      lines.push(`\`${text}\``);
    }
    return;
  }

  // Bold
  if (tag === 'strong' || tag === 'b') {
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(`**${text}**`);
    }
    return;
  }

  // Italic
  if (tag === 'em' || tag === 'i') {
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(`*${text}*`);
    }
    return;
  }

  // Lists
  if (tag === 'li') {
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push(`- ${text}`);
    }
    return;
  }

  // Horizontal rule
  if (tag === 'hr') {
    lines.push('');
    lines.push('---');
    lines.push('');
    return;
  }

  // Line break
  if (tag === 'br') {
    lines.push('');
    return;
  }

  // Block elements — add blank lines around them
  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock) {
    lines.push('');
  }

  for (const child of node.childNodes) {
    walkNode(child as HTMLElement | TextNode, lines, base, insidePre);
  }

  if (isBlock) {
    lines.push('');
  }
}

function convertTable(tableEl: HTMLElement, base: URL): string {
  const rows: string[][] = [];
  let isHeaderRow = true;
  let headerRowCount = 0;

  // Process thead rows
  const thead = tableEl.querySelector('thead');
  if (thead) {
    for (const tr of thead.querySelectorAll('tr')) {
      const cells = tr.querySelectorAll('th, td').map((c) => cellText(c, base));
      if (cells.length > 0) {
        rows.push(cells);
        headerRowCount++;
      }
    }
  }

  // Process tbody rows (or direct tr children if no thead/tbody)
  const tbody = tableEl.querySelector('tbody') ?? tableEl;
  for (const tr of tbody.querySelectorAll('tr')) {
    // Skip rows already processed from thead
    if (thead && tr.parentNode === thead) continue;

    const cells = tr.querySelectorAll('th, td').map((c) => cellText(c, base));
    if (cells.length > 0) {
      // If no thead, treat the first row as header if it has <th> cells
      if (headerRowCount === 0 && isHeaderRow) {
        const hasThCells = tr.querySelectorAll('th').length > 0;
        if (hasThCells) {
          headerRowCount = 1;
        }
        isHeaderRow = false;
      }
      rows.push(cells);
    }
  }

  if (rows.length === 0) return '';

  // Normalize column count
  const maxCols = Math.max(...rows.map((r) => r.length));
  for (const row of rows) {
    while (row.length < maxCols) row.push('');
  }

  // Build markdown table
  const lines: string[] = [];
  const headerIdx = headerRowCount > 0 ? headerRowCount : 1; // default first row as header

  for (let i = 0; i < rows.length; i++) {
    lines.push('| ' + rows[i].join(' | ') + ' |');
    if (i === headerIdx - 1) {
      lines.push('| ' + rows[i].map(() => '---').join(' | ') + ' |');
    }
  }

  return lines.join('\n');
}

function cellText(cell: HTMLElement, base: URL): string {
  // For table cells, we want inline content — follow links but flatten everything else
  const parts: string[] = [];
  for (const child of cell.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      parts.push((child as TextNode).rawText.replace(/\s+/g, ' ').trim());
    } else if (child instanceof HTMLElement) {
      const childTag = child.tagName?.toLowerCase();
      if (childTag === 'a') {
        const href = resolveUrl(child.getAttribute('href'), base);
        const text = child.text.replace(/\s+/g, ' ').trim();
        if (text && href) {
          parts.push(`[${text}](${href})`);
        } else if (text) {
          parts.push(text);
        }
      } else if (childTag === 'br') {
        parts.push(' ');
      } else {
        parts.push(child.text.replace(/\s+/g, ' ').trim());
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
