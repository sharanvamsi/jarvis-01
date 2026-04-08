import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const [tokens, googleAccount, recentLogs, user] = await Promise.all([
    db.syncToken.findMany({
      where: { userId },
      select: { service: true, userExpiresAt: true },
    }),
    db.account.findFirst({
      where: { userId, provider: 'google' },
      select: { scope: true, expires_at: true },
    }),
    db.syncLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 40,
      select: {
        service: true,
        status: true,
        completedAt: true,
        errorMessage: true,
        recordsFetched: true,
        startedAt: true,
      },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { gradescopeConnected: true },
    }),
  ]);

  const tokenMap = Object.fromEntries(tokens.map(t => [t.service, t]));

  // Group logs by service
  const logsByService: Record<string, typeof recentLogs> = {};
  for (const log of recentLogs) {
    if (!logsByService[log.service]) logsByService[log.service] = [];
    logsByService[log.service].push(log);
  }

  const isRunning = recentLogs.some(l => l.status === 'running');

  const serviceStatus = (service: string) => {
    const logs = logsByService[service] ?? [];
    const latest = logs[0] ?? null;
    const lastSuccess = logs.find(l => l.status === 'success') ?? null;
    return {
      connected: !!tokenMap[service],
      lastSync: lastSuccess?.completedAt ?? null,
      syncError: latest?.status === 'failed' ? latest.errorMessage : null,
      isRunning: latest?.status === 'running',
      recordsFetched: lastSuccess?.recordsFetched ?? null,
      userExpiresAt: tokenMap[service]?.userExpiresAt ?? null,
    };
  };

  return NextResponse.json({
    isRunning,
    canvas: serviceStatus('canvas'),
    ed: serviceStatus('ed'),
    gradescope: {
      ...serviceStatus('gradescope'),
      gradescopeConnected: user?.gradescopeConnected ?? false,
    },
    google: {
      connected: !!googleAccount,
      hasCalendarScope: googleAccount?.scope?.includes('calendar') ?? false,
      expiresAt: googleAccount?.expires_at ?? null,
      lastSync:
        (logsByService['calendar'] ?? []).find(l => l.status === 'success')
          ?.completedAt ?? null,
      isRunning:
        (logsByService['calendar'] ?? [])[0]?.status === 'running',
    },
  });
}
