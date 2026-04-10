/**
 * Instrumented sync test — read runbook before running
 *
 * 1) Env: DATABASE_URL, ENCRYPTION_KEY, USER_ID (required). Optional: WEB_ORIGIN, PIPELINE_SECRET,
 *    GOOGLE_*, GRADESCOPE_SERVICE_URL, ANTHROPIC_API_KEY (for full sync side effects).
 * 2) Job-shaped timing: default `syncUser()` matches BullMQ — the worker returns after Phase 1;
 *    Phase 2 continues in-process but is NOT awaited.
 * 3) Full pipeline: pass `--await-phase2` to await the same work as background Phase 2 (Gradescope,
 *    website, enrichment, Berkeley Time, syllabus, assignment matching).
 * 4) Do not paste raw logs publicly: URLs are shortened but responses may contain PII; never log
 *    Authorization headers (this script redacts them).
 *    ED_API_KEY: optional; used for Ed API in --api-only when no ed SyncToken (also loads ../web/.env).
 * 5) Flags: --api-only (HTTP diagnostic only, no sync / no DB writes from workers) |
 *    --preflight-only | --probe-canvas | --db-write-probe | --slow-query-log | --await-phase2 | --json | --help
 * 6) Slow queries: `--slow-query-log` sets INSTRUMENT_PRISMA_SLOW_MS=200 before opening Prisma (see lib/db.ts).
 * 7) Canvas probes (`--probe-canvas`) issue extra GETs to bCourses before the real sync — omit unless needed.
 * 8) `--db-write-probe` upserts/deletes a SyncMetadata row with source __instrument_test__ (your user only).
 * 9) Read-only API pass: USER_ID=<cuid> npx tsx --env-file=.env src/scripts/instrumented-sync-test.ts --api-only
 *    (still reads DB for tokens/enrollments; does not run sync workers or persist sync data.)
 * 10) Optional JSON summary: append `--json` for structured output on the last line.
 */

import path from 'node:path';
import dotenv from 'dotenv';
import type { PrismaClient } from '@jarvis/db';
import { parseNextCanvasLink, normalizeCourseCode } from '../lib/normalize';
import { fetchAllTime, parseCourseCodeForBT } from '../lib/berkeleytime';

const REDACTED = '[redacted]';
const CANVAS_BASE = 'https://bcourses.berkeley.edu/api/v1';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GCAL_API = 'https://www.googleapis.com/calendar/v3';

interface TimingEntry {
  label: string;
  durationMs: number;
  status: 'ok' | 'error';
  error?: string;
}

interface FetchLedgerEntry {
  shortUrl: string;
  method: string;
  status: number;
  durationMs: number;
  retryAfter: string | null;
  hasNextLink: boolean;
  error?: string;
}

interface Argv {
  apiOnly: boolean;
  preflightOnly: boolean;
  probeCanvas: boolean;
  dbWriteProbe: boolean;
  slowQueryLog: boolean;
  awaitPhase2: boolean;
  json: boolean;
  help: boolean;
}

function parseArgv(argv: string[]): Argv {
  return {
    apiOnly: argv.includes('--api-only'),
    preflightOnly: argv.includes('--preflight-only'),
    probeCanvas: argv.includes('--probe-canvas'),
    dbWriteProbe: argv.includes('--db-write-probe'),
    slowQueryLog: argv.includes('--slow-query-log'),
    awaitPhase2: argv.includes('--await-phase2'),
    json: argv.includes('--json'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function shortenUrl(url: string): string {
  return url
    .replace(/^https:\/\/bcourses\.berkeley\.edu\/api\/v1/i, '[canvas]')
    .replace(/^https:\/\/us\.edstem\.org\/api/i, '[ed]')
    .replace(/^https:\/\/www\.googleapis\.com\/calendar\/v3/i, '[gcal]')
    .replace(/^https:\/\/oauth2\.googleapis\.com\/token/i, '[google-oauth]')
    .replace(/^https:\/\/berkeleytime\.com\/api\/graphql/i, '[bt]')
    .replace(/^https:\/\/api\.anthropic\.com/i, '[anthropic]')
    .replace(/\baccess_token=[^&]+/gi, 'access_token=[redacted]')
    .replace(/\brefresh_token=[^&]+/gi, 'refresh_token=[redacted]');
}

function redactHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk === 'authorization' || lk === 'x-api-key') {
      out[key] = REDACTED;
    } else {
      out[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
    }
  });
  return out;
}

const timings: TimingEntry[] = [];
const errors: { phase: string; error: string; stack?: string }[] = [];
let fetchLedger: FetchLedgerEntry[] = [];
let origFetch!: typeof globalThis.fetch;
let fetchInstrumentationInstalled = false;

type FetchInput = Parameters<typeof globalThis.fetch>[0];

function installFetchInstrumentation() {
  if (fetchInstrumentationInstalled) return;
  fetchInstrumentationInstalled = true;
  origFetch = globalThis.fetch.bind(globalThis);
  fetchLedger = [];

  globalThis.fetch = async function instrumentedFetch(
    input: FetchInput,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET') ?? 'GET';
    const shortUrl = shortenUrl(url);
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] [FETCH] → ${method} ${shortUrl}`);

    const start = Date.now();
    try {
      const res = await origFetch(input, init);
      const durationMs = Date.now() - start;
      const link = res.headers.get('link');
      const hasNextLink = !!link && /rel="next"/i.test(link);
      const retryAfter = res.headers.get('Retry-After');

      fetchLedger.push({
        shortUrl,
        method,
        status: res.status,
        durationMs,
        retryAfter,
        hasNextLink,
      });

      if (res.status === 429) {
        console.warn(
          `[${ts}] [FETCH] ← 429 ${shortUrl} ms=${durationMs} retryAfter=${retryAfter ?? 'none'} headers=${JSON.stringify(redactHeaders(new Headers(res.headers)))}`,
        );
      } else if (!res.ok) {
        console.warn(
          `[${ts}] [FETCH] ← ${res.status} ${shortUrl} ms=${durationMs}`,
        );
      } else {
        console.log(`[${ts}] [FETCH] ← ${res.status} ${shortUrl} ms=${durationMs}${hasNextLink ? ' hasNextPage' : ''}`);
      }

      return res;
    } catch (err) {
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      fetchLedger.push({
        shortUrl,
        method: String(method),
        status: 0,
        durationMs,
        retryAfter: null,
        hasNextLink: false,
        error: msg,
      });
      console.error(`[${ts}] [FETCH] ← NETWORK ${shortUrl} ms=${durationMs} error=${msg}`);
      throw err;
    }
  };
}

function logTs(prefix: string, message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  const tail = extra
    ? ` ${Object.entries(extra)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ')}`
    : '';
  console.log(`[${ts}] [${prefix}] ${message}${tail}`);
}

async function time<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T | undefined; durationMs: number; ok: boolean }> {
  logTs('TIMING', `START ${label}`);
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    timings.push({ label, durationMs, status: 'ok' });
    logTs('TIMING', `END ${label}`, { ms: durationMs });
    return { result, durationMs, ok: true };
  } catch (err) {
    const durationMs = Date.now() - start;
    const e = err instanceof Error ? err : new Error(String(err));
    timings.push({ label, durationMs, status: 'error', error: e.message });
    errors.push({ phase: label, error: e.message, stack: e.stack });
    logTs('ERROR', `FAILED ${label}`, { ms: durationMs, error: e.message });
    return { result: undefined, durationMs, ok: false };
  }
}

async function runPreflight(userId: string, db: PrismaClient) {
  logTs('INFO', '═══ PREFLIGHT ═══');

  await time('preflight.user', () => db.user.findUnique({ where: { id: userId }, select: { id: true, currentSemester: true } }));

  const { result: canvasTok } = await time('preflight.syncToken.canvas', () =>
    db.syncToken.findUnique({
      where: { userId_service: { userId, service: 'canvas' } },
      select: { updatedAt: true, userExpiresAt: true },
    }),
  );

  if (!canvasTok) {
    logTs('WARN', 'No Canvas sync token — sync will no-op Canvas worker');
  } else {
    logTs('INFO', 'Canvas token present', {
      updatedAt: canvasTok.updatedAt.toISOString(),
      userExpiresAt: canvasTok.userExpiresAt?.toISOString() ?? null,
    });
  }

  const { result: gAcc } = await time('preflight.account.google', () =>
    db.account.findFirst({
      where: { userId, provider: 'google' },
      select: { expires_at: true, scope: true, refresh_token: true },
    }),
  );

  if (gAcc) {
    const exp = gAcc.expires_at != null ? new Date(gAcc.expires_at * 1000) : null;
    logTs('INFO', 'Google account', {
      hasCalendarScope: (gAcc.scope ?? '').includes('calendar'),
      expiresAt: exp?.toISOString() ?? null,
      hasRefreshToken: !!gAcc.refresh_token,
    });
  } else {
    logTs('INFO', 'No Google account row');
  }

  for (const service of ['canvas', 'calendar', 'gradescope', 'ed', 'course_website'] as const) {
    const { result: lastOk } = await time(`preflight.syncLog.${service}`, () =>
      db.syncLog.findFirst({
        where: { userId, service, status: 'success' },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true, recordsFetched: true },
      }),
    );
    if (lastOk?.completedAt) {
      logTs('INFO', `Last success ${service}`, { completedAt: lastOk.completedAt.toISOString() });
    }
  }

  const { result: enrollments } = await time('preflight.enrollments', () =>
    db.enrollment.findMany({
      where: { userId },
      include: { course: { select: { courseCode: true, canvasId: true, term: true, edCourseId: true } } },
    }),
  );

  logTs('INFO', `Enrollment count: ${enrollments?.length ?? 0}`);
  enrollments?.forEach((e: { course: { courseCode: string | null; canvasId: string | null } }) =>
    logTs('INFO', `  course ${e.course.courseCode}`, { canvasId: e.course.canvasId }),
  );

  await time('preflight.db.select1', () => db.$queryRaw`SELECT 1`);

  const { result: acount } = await time('preflight.assignment.count', () =>
    db.assignment.count({
      where: { course: { enrollments: { some: { userId } } } },
    }),
  );
  logTs('INFO', `Assignment count (via enrollments): ${acount ?? 0}`);
}

async function runDbReadLatency(userId: string, db: PrismaClient) {
  logTs('INFO', '═══ DB READ LATENCY (no writes) ═══');
  await time('db.syncToken.findUnique', () =>
    db.syncToken.findUnique({ where: { userId_service: { userId, service: 'canvas' } } }),
  );
  await time('db.enrollment.findMany', () =>
    db.enrollment.findMany({ where: { userId }, include: { course: true } }),
  );
  await time('db.userAssignment.count', () => db.userAssignment.count({ where: { userId } }));
}

async function runDbWriteProbe(userId: string, db: PrismaClient) {
  const source = '__instrument_test__';
  logTs('INFO', '═══ DB WRITE PROBE (SyncMetadata) ═══');
  await time('db.syncMetadata.upsert.probe', () =>
    db.syncMetadata.upsert({
      where: { userId_source: { userId, source } },
      create: {
        userId,
        source,
        lastSynced: new Date(),
        initialBackfillCompleted: false,
      },
      update: { lastSynced: new Date() },
    }),
  );
  await db.syncMetadata.deleteMany({ where: { userId, source } });
  logTs('INFO', 'Removed probe SyncMetadata row');
}

async function runCanvasProbes(
  userId: string,
  db: PrismaClient,
  decrypt: (s: string) => string,
) {
  logTs('INFO', '═══ EXTRA CANVAS PROBES (additional HTTP) ═══');
  const tok = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'canvas' } },
    select: { accessToken: true },
  });
  if (!tok) {
    logTs('WARN', 'Skipping Canvas probes — no token');
    return;
  }

  const token = decrypt(tok.accessToken);
  const base =
    'https://bcourses.berkeley.edu/api/v1/courses?enrollment_state=active&include[]=term&include[]=teachers&per_page=100';
  const { result: res, ok } = await time('probe.canvas.courses', async () => {
    const r = await origFetch(base, { headers: { Authorization: `Bearer ${token}` } });
    return r;
  });
  if (!res || !ok || !res.ok) {
    logTs('ERROR', 'Canvas course list probe failed', { status: res?.status });
    return;
  }
  const courses = (await res.json()) as { id: number; name?: string }[];
  logTs('INFO', `Probe: ${courses.length} courses (first page)`);

  const sample = courses.slice(0, 2);
  for (const c of sample) {
    await Promise.all([
      time(`probe.canvas.assignments[${c.id}]`, async () => {
        const r = await origFetch(
          `https://bcourses.berkeley.edu/api/v1/courses/${c.id}/assignments?per_page=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return r;
      }),
      time(`probe.canvas.submissions[${c.id}]`, async () => {
        const r = await origFetch(
          `https://bcourses.berkeley.edu/api/v1/courses/${c.id}/students/submissions?student_ids[]=self&per_page=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return r;
      }),
      time(`probe.canvas.announcements[${c.id}]`, async () => {
        const r = await origFetch(
          `https://bcourses.berkeley.edu/api/v1/courses/${c.id}/discussion_topics?only_announcements=true&per_page=100`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        return r;
      }),
    ]);
  }
}

async function refreshGoogleAccessTokenNoPersist(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set');
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/** Valid access token for Calendar API; may refresh via Google without writing Account rows. */
async function getCalendarAccessTokenDiagnostic(
  db: PrismaClient,
  userId: string,
): Promise<string | null> {
  const REFRESH_BUFFER = 300;
  const account = await db.account.findFirst({
    where: { userId, provider: 'google' },
  });
  if (!account) {
    logTs('INFO', 'api-only: no Google account — skipping Calendar');
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;
  const needsRefresh = expiresAt - now < REFRESH_BUFFER;
  if (needsRefresh && account.refresh_token) {
    try {
      logTs('INFO', 'api-only: refreshing Google access token (not saved to DB)');
      return await refreshGoogleAccessTokenNoPersist(account.refresh_token);
    } catch (e) {
      logTs('WARN', 'api-only: Google refresh failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      if (expiresAt < now) return null;
    }
  }
  return account.access_token ?? null;
}

async function fetchGoogleCalendarEventsDiagnostic(accessToken: string): Promise<number> {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
  let count = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(
      `${GCAL_API}/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      throw new Error(`Calendar API ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { items?: unknown[]; nextPageToken?: string };
    count += data.items?.length ?? 0;
    pageToken = data.nextPageToken;
  } while (pageToken);
  return count;
}

async function canvasPaginatedJson(
  startUrl: string,
  token: string,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let next: string | null = startUrl;
  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`Canvas HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }
    const chunk = (await res.json()) as unknown[];
    rows.push(...chunk);
    const link = res.headers.get('link');
    next = link ? parseNextCanvasLink(link) : null;
  }
  return rows;
}

/**
 * External HTTP only (instrumented fetch). Uses DB reads for tokens and enrollment canvas IDs.
 * Does not invoke pipeline workers — no Canvas/Ed/Calendar/Gradescope DB sync writes.
 */
async function runApiOnlyDiagnostic(userId: string, db: PrismaClient, decrypt: (s: string) => string) {
  logTs('INFO', '═══ API-ONLY DIAGNOSTIC (terminal logs only; no sync worker / no sync DB writes) ═══');

  const canvasTok = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'canvas' } },
    select: { accessToken: true },
  });

  if (canvasTok) {
    const token = decrypt(canvasTok.accessToken);
    await time('api-only.canvas.courses_full', async () => {
      const courses = (await canvasPaginatedJson(
        `${CANVAS_BASE}/courses?enrollment_state=active&include[]=enrollments&include[]=term&include[]=teachers&per_page=100`,
        token,
      )) as { id: number; name?: string }[];
      logTs('INFO', `api-only: Canvas courses (all pages): ${courses.length}`);
      return courses.length;
    });

    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: { course: { select: { canvasId: true, courseCode: true } } },
    });
    let ids = enrollments
      .map((e) => e.course.canvasId)
      .filter((id): id is string => !!id);
    if (ids.length === 0) {
      const courses = (await canvasPaginatedJson(
        `${CANVAS_BASE}/courses?enrollment_state=active&per_page=100`,
        token,
      )) as { id: number }[];
      ids = courses.map((c) => String(c.id));
      logTs('WARN', 'api-only: no canvasId on enrollments — using Canvas course list ids');
    }

    const sample = ids.slice(0, 8);
    logTs('INFO', `api-only: per-course Canvas sample (max 8 of ${ids.length}): ${sample.join(', ')}`);

    for (const courseId of sample) {
      await time(`api-only.canvas.bundle[${courseId}]`, async () => {
        const [assignments, submissions, announcements] = await Promise.all([
          canvasPaginatedJson(
            `${CANVAS_BASE}/courses/${courseId}/assignments?per_page=100`,
            token,
          ),
          canvasPaginatedJson(
            `${CANVAS_BASE}/courses/${courseId}/students/submissions?student_ids[]=self&per_page=100`,
            token,
          ),
          canvasPaginatedJson(
            `${CANVAS_BASE}/courses/${courseId}/discussion_topics?only_announcements=true&per_page=100`,
            token,
          ),
        ]);
        logTs('INFO', `api-only: course ${courseId}`, {
          assignments: assignments.length,
          submissions: submissions.length,
          announcements: announcements.length,
        });
      });
    }
  } else {
    logTs('WARN', 'api-only: no Canvas token — skipping Canvas');
  }

  const calTok = await getCalendarAccessTokenDiagnostic(db, userId);
  if (calTok) {
    await time('api-only.google.calendar_events', async () => {
      const n = await fetchGoogleCalendarEventsDiagnostic(calTok);
      logTs('INFO', `api-only: Calendar events in window: ${n}`);
      return n;
    });
  }

  const edTokRow = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'ed' } },
    select: { accessToken: true },
  });
  let edBearer: string | null = null;
  if (edTokRow) {
    edBearer = decrypt(edTokRow.accessToken);
  } else {
    const fromEnv = process.env.ED_API_KEY?.trim();
    if (fromEnv) {
      edBearer = fromEnv;
      logTs('INFO', 'api-only: using ED_API_KEY from env (no ed row in sync_tokens)');
    }
  }

  if (edBearer) {
    const withEd = await db.enrollment.findMany({
      where: { userId },
      include: { course: { select: { edCourseId: true, courseCode: true } } },
    });
    const firstEd = withEd.find((e) => e.course.edCourseId);
    if (firstEd?.course.edCourseId) {
      const cid = firstEd.course.edCourseId;
      await time(`api-only.ed.threads[${firstEd.course.courseCode}]`, async () => {
        const r = await fetch(
          `https://us.edstem.org/api/courses/${cid}/threads?limit=10&offset=0&sort=new`,
          {
            headers: {
              Authorization: `Bearer ${edBearer}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(30000),
          },
        );
        if (!r.ok) {
          const body = await r.text();
          throw new Error(
            `Ed HTTP ${r.status}: ${body.slice(0, 300)}`,
          );
        }
        const body = (await r.json()) as { threads?: unknown[] };
        logTs('INFO', `api-only: Ed threads (first page): ${body.threads?.length ?? 0}`);
        return body.threads?.length ?? 0;
      });
    } else {
      logTs('INFO', 'api-only: no edCourseId on enrollments — skipping Ed');
    }
  } else {
    logTs('INFO', 'api-only: no Ed token or ED_API_KEY — skipping Ed');
  }

  const gsUrl = process.env.GRADESCOPE_SERVICE_URL ?? 'http://localhost:8001';
  await time('api-only.gradescope.health', async () => {
    const r = await fetch(`${gsUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(15000),
    });
    logTs('INFO', `api-only: Gradescope service /health → ${r.status}`);
    if (!r.ok) throw new Error(`health ${r.status}`);
    return r.status;
  });

  const gsCred = await db.syncToken.findUnique({
    where: { userId_service: { userId, service: 'gradescope' } },
    select: { accessToken: true },
  });
  if (gsCred) {
    let email = '';
    let password = '';
    try {
      const raw = decrypt(gsCred.accessToken);
      try {
        const p = JSON.parse(raw) as { email?: string; password?: string };
        email = p.email ?? '';
        password = p.password ?? '';
      } catch {
        password = raw;
        email = process.env.GRADESCOPE_EMAIL ?? '';
      }
    } catch (e) {
      logTs('WARN', 'api-only: Gradescope decrypt failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (email && password) {
      await time('api-only.gradescope.courses', async () => {
        const r = await fetch(`${gsUrl.replace(/\/$/, '')}/courses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(`Gradescope /courses ${r.status}: ${t.slice(0, 200)}`);
        }
        const data = (await r.json()) as { courses?: unknown[] };
        const n = data.courses?.length ?? Object.keys(data).length;
        logTs('INFO', 'api-only: Gradescope courses response ok', {
          approxCount: typeof n === 'number' ? n : undefined,
        });
        return r.status;
      });
    } else {
      logTs('WARN', 'api-only: Gradescope credentials incomplete — skipping /courses');
    }
  } else {
    logTs('INFO', 'api-only: no Gradescope token — skipping /courses');
  }

  const enrollmentsForBt = await db.enrollment.findFirst({
    where: { userId },
    include: { course: { select: { courseCode: true } } },
  });
  if (enrollmentsForBt?.course.courseCode) {
    const normalized = normalizeCourseCode(enrollmentsForBt.course.courseCode);
    const parsed = parseCourseCodeForBT(normalized);
    if (parsed) {
      await time('api-only.berkeleytime.fetchAllTime', async () => {
        const dist = await fetchAllTime(parsed.subject, parsed.courseNumber);
        logTs('INFO', 'api-only: BerkeleyTime fetchAllTime', {
          course: `${parsed.subject} ${parsed.courseNumber}`,
          hasData: dist != null,
        });
        return dist;
      });
    } else {
      logTs('INFO', 'api-only: could not parse course code for BerkeleyTime', { normalized });
    }
  }

  logTs('INFO', '═══ API-ONLY DIAGNOSTIC FINISHED ═══');
}

function printReport(args: {
  jobWallMs: number | null;
  fullPipelineExtraMs: number | null;
  awaitPhase2: boolean;
  apiOnly: boolean;
}) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('JARVIS — INSTRUMENTED SYNC REPORT');
  console.log('═══════════════════════════════════════════════════════');

  if (args.apiOnly) {
    console.log('\nMode: --api-only (no sync workers; DB read for tokens only)');
  }

  console.log('\n── Known edge cases (checklist) ────────────────────────');
  console.log(
    '  • BullMQ marks the job done when syncUser() returns; Phase 2 may still be running or failing in the background.',
  );
  console.log(
    '  • canvas.ts mutates currentCourseIds[] from parallel course tasks (possible race under concurrency).',
  );
  console.log('  • Cron enqueues at most 15 stale users every 30 minutes (apps/pipeline/src/index.ts).');
  console.log(
    '  • Gradescope worker skips work if lastSynced < 6h without writing a new success syncLog.',
  );

  const sortedT = [...timings].sort((a, b) => b.durationMs - a.durationMs);
  console.log('\n── TIMINGS (top 25) ─────────────────────────────────────');
  console.log(`${'Label'.slice(0, 60).padEnd(60)} ${'Ms'.padStart(8)}`);
  console.log('─'.repeat(70));
  for (const t of sortedT.slice(0, 25)) {
    const flag = t.status === 'ok' ? '✓' : '✗';
    console.log(
      `${flag} ${t.label.slice(0, 58).padEnd(58)} ${String(t.durationMs).padStart(8)}${t.error ? `  ${t.error.slice(0, 48)}` : ''}`,
    );
  }

  const sortedF = [...fetchLedger].sort((a, b) => b.durationMs - a.durationMs);
  console.log('\n── FETCH LEDGER (top 30 by duration) ──────────────────');
  for (const f of sortedF.slice(0, 30)) {
    const next = f.hasNextLink ? ' [pagination]' : '';
    const ra = f.retryAfter ? ` retryAfter=${f.retryAfter}` : '';
    console.log(
      `${f.status} ${f.method} ${f.shortUrl.slice(0, 68)} ${f.durationMs}ms${next}${ra}${f.error ? ` ERR:${f.error}` : ''}`,
    );
  }

  const r429 = fetchLedger.filter((f) => f.status === 429);
  if (r429.length) {
    console.log(`\n⚠ 429 responses: ${r429.length}`);
    r429.forEach((f) => console.log(`   ${f.shortUrl}`));
  }

  const pagers = fetchLedger.filter((f) => f.hasNextLink);
  if (pagers.length) {
    console.log(`\nRequests with Link rel=next (more pages exist): ${pagers.length}`);
  }

  if (args.jobWallMs != null) {
    console.log(`\n── Job-shaped wall (syncUser, Phase 1 + return) ────────`);
    console.log(`  ${args.jobWallMs}ms`);
  }
  if (args.awaitPhase2 && args.fullPipelineExtraMs != null) {
    console.log(`\n── Full sync wall time ──────────────────────────────────`);
    console.log(`  ${args.fullPipelineExtraMs}ms (syncUser total; see TIMINGS)`);
  }

  if (errors.length) {
    console.log('\n── ERRORS ──────────────────────────────────────────────');
    errors.forEach((e, i) => {
      console.log(`\n[${i + 1}] ${e.phase}: ${e.error}`);
      if (e.stack) console.log(e.stack.split('\n').slice(1, 5).join('\n'));
    });
  } else {
    console.log(
      args.apiOnly
        ? '\n── Collected errors: none ──'
        : '\n── Collected errors: none (check worker logs for Phase 2 if job-shaped) ──',
    );
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

async function main() {
  const argvRaw = process.argv.slice(2);
  const flags = parseArgv(argvRaw);

  if (flags.help) {
    console.log(`
Usage:
  USER_ID=<cuid> npx tsx --env-file=.env src/scripts/instrumented-sync-test.ts [flags]

Flags:
  --api-only           HTTP diagnostic only: same external APIs, no sync workers (no sync DB writes).
                       Still reads DB for tokens/enrollments. Logs to stdout only.
  --preflight-only     DB reads + optional probes only (no syncUser, no --api-only crawl)
  --probe-canvas       Extra Canvas GETs before sync (ignored if --api-only)
  --db-write-probe     Upsert/delete SyncMetadata source __instrument_test__ (ignored if --api-only)
  --slow-query-log     Log Prisma queries slower than INSTRUMENT_PRISMA_SLOW_MS (default 200)
  --await-phase2       Await Phase 2 (ignored if --api-only)
  --json               Print JSON summary as final line to stdout
  --help               This message

Default: run syncUser() (job-shaped) after preflight; Phase 2 is NOT awaited.
`);
    process.exit(0);
  }

  if (flags.slowQueryLog && !process.env.INSTRUMENT_PRISMA_SLOW_MS) {
    process.env.INSTRUMENT_PRISMA_SLOW_MS = '200';
  }

  const userId = process.env.USER_ID?.trim();
  if (!userId) {
    console.error('USER_ID env var is required');
    process.exit(1);
  }

  // Pick up ED_API_KEY etc. from apps/web/.env when running from apps/pipeline (does not override existing env).
  dotenv.config({ path: path.resolve(process.cwd(), '../web/.env') });

  if (flags.apiOnly && flags.awaitPhase2) {
    console.warn('[warn] --await-phase2 ignored with --api-only');
  }
  if (flags.apiOnly && flags.dbWriteProbe) {
    console.warn('[warn] --db-write-probe ignored with --api-only (no DB writes)');
  }

  installFetchInstrumentation();

  const runFullSync = !flags.preflightOnly && !flags.apiOnly;

  const [dbMod, cryptoMod] = await Promise.all([import('../lib/db'), import('../lib/crypto')]);
  const db = dbMod.db;
  const { decrypt } = cryptoMod;

  let syncUser: ((uid: string, services?: string[]) => Promise<void>) | undefined;
  if (runFullSync) {
    const syncJobs = await import('../jobs/syncUser');
    syncUser = syncJobs.syncUser;
  }

  const totalStart = Date.now();
  let totalMs = 0;
  let jobWallMs: number | null = null;
  let fullStart = Date.now();
  let fullEnd = Date.now();

  try {
    await runPreflight(userId, db);
    await runDbReadLatency(userId, db);

    if (flags.dbWriteProbe && !flags.apiOnly) {
      await runDbWriteProbe(userId, db);
    }

    if (flags.probeCanvas && !flags.apiOnly) {
      await runCanvasProbes(userId, db, decrypt);
    } else if (flags.probeCanvas && flags.apiOnly) {
      logTs('INFO', 'Skipping --probe-canvas (Canvas already covered by --api-only)');
    }

    if (flags.preflightOnly) {
      logTs('INFO', 'Preflight-only mode — skipping sync and API crawl');
    } else if (flags.apiOnly) {
      await runApiOnlyDiagnostic(userId, db, decrypt);
      jobWallMs = null;
    } else if (flags.awaitPhase2) {
      fullStart = Date.now();
      const { durationMs } = await time('sync.syncUser_full', () =>
        syncUser!(userId),
      );
      fullEnd = Date.now();
      jobWallMs = null;
      logTs('INFO', 'syncUser finished', { ms: durationMs });
    } else {
      const jStart = Date.now();
      await time('sync.syncUser_job_shaped', () => syncUser!(userId));
      jobWallMs = Date.now() - jStart;
      logTs('INFO', 'syncUser completed', {
        jobWallMs,
      });
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    errors.push({ phase: 'main', error: err.message, stack: err.stack });
    logTs('ERROR', err.message);
  } finally {
    totalMs = Date.now() - totalStart;
    logTs('INFO', `Total script wall time: ${totalMs}ms`);

    printReport({
      jobWallMs,
      fullPipelineExtraMs: flags.awaitPhase2 ? fullEnd - fullStart : null,
      awaitPhase2: flags.awaitPhase2,
      apiOnly: flags.apiOnly,
    });

    if (flags.json) {
      const summary = {
        userId,
        mode: flags.apiOnly ? 'api-only' : flags.preflightOnly ? 'preflight-only' : 'sync',
        flags,
        totalScriptMs: totalMs,
        jobWallMs,
        timingTop: [...timings].sort((a, b) => b.durationMs - a.durationMs).slice(0, 40),
        fetchCount: fetchLedger.length,
        fetch429: fetchLedger.filter((f) => f.status === 429).length,
        paginationHints: fetchLedger.filter((f) => f.hasNextLink).length,
        errors: errors.map((e) => ({ phase: e.phase, error: e.error })),
      };
      console.log(`JSON_SUMMARY:${JSON.stringify(summary)}`);
    }

    await db.$disconnect();
  }
}

main();
