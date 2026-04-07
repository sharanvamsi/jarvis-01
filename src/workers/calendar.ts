import 'dotenv/config';
import { db } from '../lib/db';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_API = 'https://oauth2.googleapis.com/token';
const REFRESH_BUFFER_SECONDS = 300;

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status: string;
  htmlLink?: string;
}

interface GoogleEventsResponse {
  items: GoogleEvent[];
  nextPageToken?: string;
}

async function refreshGoogleToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await db.account.findFirst({
    where: { userId, provider: 'google' },
  });

  if (!account) {
    console.warn('[calendar] No Google account found for user');
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;
  const needsRefresh = expiresAt - now < REFRESH_BUFFER_SECONDS;

  if (needsRefresh && account.refresh_token) {
    console.log('[calendar] Refreshing access token');
    try {
      const { accessToken, expiresAt: newExpiry } = await refreshGoogleToken(
        account.refresh_token
      );

      await db.account.update({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: account.providerAccountId,
          },
        },
        data: {
          access_token: accessToken,
          expires_at: newExpiry,
        },
      });

      return accessToken;
    } catch (e) {
      console.error('[calendar] Token refresh failed:', e);
      // If token is already expired, we can't proceed
      if (expiresAt < now) return null;
    }
  }

  return account.access_token ?? null;
}

async function fetchCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const allEvents: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(
      `${CALENDAR_API}/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) }
    );

    if (response.status === 401) {
      throw new Error('Calendar access token expired or invalid');
    }
    if (!response.ok) {
      throw new Error(
        `Calendar API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as GoogleEventsResponse;
    allEvents.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allEvents;
}

function detectCourseCode(
  event: GoogleEvent,
  courses: Array<{ courseCode: string | null }>
): string | null {
  const title = (event.summary ?? '').toLowerCase();
  for (const course of courses) {
    if (course.courseCode && title.includes(course.courseCode.toLowerCase())) {
      return course.courseCode;
    }
  }
  return null;
}

function isClassEvent(
  event: GoogleEvent,
  courseCodes: string[]
): boolean {
  const title = (event.summary ?? '').toLowerCase();
  return courseCodes.some(
    (code) =>
      title.includes(code.toLowerCase()) ||
      title.includes('lecture') ||
      title.includes('discussion') ||
      title.includes('lab') ||
      title.includes('section')
  );
}

export async function runCalendarSync(userId: string): Promise<void> {
  console.log(`[calendar] Starting sync for user ${userId}`);

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    console.warn('[calendar] No valid Google token, skipping');
    return;
  }

  const syncLog = await db.syncLog.create({
    data: { userId, service: 'calendar', status: 'running' },
  });

  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    const now = new Date();
    const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const timeMin = now.toISOString();
    const timeMax = future.toISOString();

    console.log('[calendar] Fetching events...');
    const events = await fetchCalendarEvents(accessToken, timeMin, timeMax);
    console.log(`[calendar] Fetched ${events.length} events`);

    // Get enrolled courses for class detection
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: { course: { select: { courseCode: true } } },
    });
    const courses = enrollments.map((e) => e.course);
    const courseCodes = courses
      .map((c) => c.courseCode)
      .filter((code): code is string => code != null);

    // Batch all DB writes into a single transaction instead of 3 calls per event
    const txOps: any[] = [];

    for (const event of events) {
      if (event.status === 'cancelled') continue;

      const isAllDay = !!event.start.date && !event.start.dateTime;
      const startTime = isAllDay
        ? new Date(event.start.date + 'T12:00:00Z')
        : new Date(event.start.dateTime!);
      const endTime = isAllDay
        ? new Date(event.end.date + 'T12:00:00Z')
        : new Date(event.end.dateTime!);

      const classEvent = isClassEvent(event, courseCodes);
      const linkedCourseCode = classEvent
        ? detectCourseCode(event, courses)
        : null;

      const berkeleyStart = classEvent
        ? new Date(startTime.getTime() + 10 * 60 * 1000)
        : null;
      const berkeleyEnd = classEvent
        ? new Date(endTime.getTime() + 10 * 60 * 1000)
        : null;

      const title = event.summary ?? 'Untitled';
      const location = event.location ?? null;

      txOps.push(db.calendarEvent.upsert({
        where: { userId_googleEventId: { userId, googleEventId: event.id } },
        update: { title, startTime, endTime, location, isAllDay, isClassEvent: classEvent, courseCode: linkedCourseCode, berkeleyStart, berkeleyEnd },
        create: { userId, googleEventId: event.id, title, startTime, endTime, location, isAllDay, isClassEvent: classEvent, courseCode: linkedCourseCode, berkeleyStart, berkeleyEnd },
      }));

      recordsCreated++;
    }

    if (txOps.length > 0) {
      await db.$transaction(txOps);
    }
    console.log(`[calendar] Wrote ${txOps.length} ops in single transaction`);

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        recordsCreated,
        recordsUpdated,
      },
    });

    console.log(
      `[calendar] Sync complete. Created: ${recordsCreated}, Updated: ${recordsUpdated}`
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[calendar] Sync failed:', message);
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: message,
      },
    });
  }
}
