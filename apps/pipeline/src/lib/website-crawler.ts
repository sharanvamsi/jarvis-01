// Shared website crawler — fetches a root URL plus same-origin links one
// level deep, cleans HTML to markdown, and returns per-page results with
// content hashes. Used by both the test script and the real worker.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { cleanHtml } from './html-cleaner';

const FETCH_TIMEOUT_MS = 15_000;
const FETCH_RETRIES = 3;
const INTER_REQUEST_DELAY_MS = 500;
const DEFAULT_PAGE_CAP = 100;
const JS_SHELL_TEXT_THRESHOLD = 500;

const SKIP_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.ics', '.csv', '.xlsx', '.xls', '.doc', '.docx', '.ppt', '.pptx',
  '.mp4', '.mov', '.avi', '.mp3', '.wav',
  '.js', '.css', '.json', '.xml',
]);

export interface CrawlResult {
  url: string;
  status: 'ok' | 'failed' | 'js-shell-suspected' | 'auth-walled';
  rawByteLength: number;
  textLength: number;
  html: string;
  markdown: string;
  markdownChars: number;
  contentHash: string;
  reductionPercent: number;
  error?: string;
}

export interface CrawlSummary {
  total: number;
  ok: number;
  failed: number;
  jsShellSuspected: number;
  authWalled: number;
  totalRawHtmlBytes: number;
  totalMarkdownChars: number;
  overallReductionPercent: number;
  combinedContentHash: string;
}

export async function fetchWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (err) {
      lastError = err as Error;
      console.warn(`[crawler] fetch ${url} attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }
  throw lastError ?? new Error('fetch failed');
}

export function canonicalize(rawHref: string, base: URL): URL | null {
  try {
    const u = new URL(rawHref, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    u.search = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u;
  } catch {
    return null;
  }
}

export function shouldFollow(link: URL, root: URL): boolean {
  if (link.origin !== root.origin) return false;
  const ext = path.extname(link.pathname).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return false;
  return true;
}

export function extractLinks(html: string, base: URL): string[] {
  const root = parseHtml(html);
  const anchors = root.querySelectorAll('a[href]');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    const canonical = canonicalize(href, base);
    if (!canonical) continue;
    if (!shouldFollow(canonical, base)) continue;
    const key = canonical.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function visibleTextLength(html: string): number {
  try {
    const root = parseHtml(html);
    for (const node of root.querySelectorAll('script, style, noscript')) {
      node.remove();
    }
    return root.text.replace(/\s+/g, ' ').trim().length;
  } catch {
    return 0;
  }
}

const AUTH_WALL_PATTERNS = [
  /calnet/i,
  /cas\.berkeley\.edu/i,
  /clientredirect/i,
  /cirrus/i,
  /shibboleth/i,
  /single\s*sign[\s-]*on/i,
  /login\.berkeley\.edu/i,
  /auth\.berkeley\.edu/i,
];

export function isAuthWalled(html: string, url: string): boolean {
  if (/clientredirect|cas\.berkeley|login\.berkeley|auth\.berkeley/i.test(url)) return true;
  const sample = html.slice(0, 5000).toLowerCase();
  const matchCount = AUTH_WALL_PATTERNS.filter((p) => p.test(sample)).length;
  return matchCount >= 2;
}

async function crawlOne(url: string): Promise<CrawlResult> {
  try {
    const html = await fetchWithRetry(url);
    const textLength = visibleTextLength(html);

    let status: CrawlResult['status'] = 'ok';
    if (isAuthWalled(html, url)) {
      status = 'auth-walled';
      console.warn(`[crawler] ${url}: auth-walled (CalNet/CAS login page detected)`);
    } else if (textLength < JS_SHELL_TEXT_THRESHOLD) {
      status = 'js-shell-suspected';
      console.warn(
        `[crawler] ${url}: only ${textLength} chars of visible text — likely JS-rendered`,
      );
    }

    const rawByteLength = Buffer.byteLength(html, 'utf8');

    let markdown = '';
    let markdownChars = 0;
    let contentHash = '';
    if (status === 'ok' || status === 'js-shell-suspected') {
      const cleaned = cleanHtml(html, url);
      markdown = cleaned.markdown;
      markdownChars = cleaned.charCount;
      contentHash = createHash('sha256').update(markdown).digest('hex');
    }

    const reductionPercent = rawByteLength > 0
      ? Math.round((1 - markdownChars / rawByteLength) * 100)
      : 0;

    return {
      url, status, rawByteLength, textLength, html,
      markdown, markdownChars, contentHash, reductionPercent,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url, status: 'failed', rawByteLength: 0, textLength: 0,
      html: '', markdown: '', markdownChars: 0, contentHash: '',
      reductionPercent: 0, error: msg,
    };
  }
}

/**
 * Crawl a website: fetch root + same-origin links one level deep.
 * Returns per-page results with cleaned markdown and content hashes.
 */
export async function crawlSite(
  rootUrl: string,
  pageCap: number = DEFAULT_PAGE_CAP,
): Promise<{ results: CrawlResult[]; summary: CrawlSummary }> {
  const root = new URL(rootUrl);

  // Step 1: fetch root
  const rootResult = await crawlOne(root.toString());
  const crawled: CrawlResult[] = [rootResult];

  // Step 2: discover links from root
  let discoveredLinks: string[] = [];
  const canonicalRoot = canonicalize(root.toString(), root)!.toString();
  if (rootResult.status !== 'failed') {
    discoveredLinks = extractLinks(rootResult.html, root).filter(
      (l) => l !== canonicalRoot && l !== root.toString(),
    );
    console.log(`[crawler] discovered ${discoveredLinks.length} same-origin links`);
  } else {
    console.error(`[crawler] root fetch failed, no links to follow`);
  }

  // Step 3: enforce page cap
  const remainingBudget = Math.max(0, pageCap - 1);
  const capHit = discoveredLinks.length > remainingBudget;
  const linksToFetch = discoveredLinks.slice(0, remainingBudget);
  if (capHit) {
    console.warn(
      `[crawler] page cap hit: ${discoveredLinks.length} links found, fetching first ${remainingBudget}`,
    );
  }

  // Step 4: fetch each link sequentially with politeness delay
  for (let i = 0; i < linksToFetch.length; i++) {
    const link = linksToFetch[i];
    console.log(`[crawler] [${i + 1}/${linksToFetch.length}] ${link}`);
    const result = await crawlOne(link);
    crawled.push(result);
    if (i < linksToFetch.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_REQUEST_DELAY_MS));
    }
  }

  // Step 5: build summary
  const totalRawHtmlBytes = crawled.reduce((s, p) => s + p.rawByteLength, 0);
  const totalMarkdownChars = crawled.reduce((s, p) => s + p.markdownChars, 0);
  const overallReductionPercent = totalRawHtmlBytes > 0
    ? Math.round((1 - totalMarkdownChars / totalRawHtmlBytes) * 100)
    : 0;
  const combinedContentHash = createHash('sha256')
    .update(crawled.filter((p) => p.contentHash).map((p) => p.contentHash).join(':'))
    .digest('hex');

  const summary: CrawlSummary = {
    total: crawled.length,
    ok: crawled.filter((p) => p.status === 'ok').length,
    failed: crawled.filter((p) => p.status === 'failed').length,
    jsShellSuspected: crawled.filter((p) => p.status === 'js-shell-suspected').length,
    authWalled: crawled.filter((p) => p.status === 'auth-walled').length,
    totalRawHtmlBytes,
    totalMarkdownChars,
    overallReductionPercent,
    combinedContentHash,
  };

  return { results: crawled, summary };
}
