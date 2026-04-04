'use client';

import { useState, useEffect, useCallback } from 'react';
import { signIn } from 'next-auth/react';
import StatusDot from './StatusDot';
import SetupGuide from './SetupGuide';
import { formatLastSync } from './types';

type GoogleCalStatus = {
  connected: boolean;
  hasCalendarScope: boolean;
  lastSync: string | null;
  eventCount: number;
};

const SETUP_STEPS = [
  { text: 'Click "Connect Google Calendar" above' },
  { text: 'Select your Berkeley Google account when prompted' },
  { text: 'Grant "View your calendars" permission (read-only — Jarvis never modifies events)' },
];

export default function GoogleCalendarCard() {
  const [status, setStatus] = useState<GoogleCalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/google/status')
      .then((r) => r.json())
      .then((data: GoogleCalStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleReconnect() {
    setRevoking(true);
    try {
      await fetch('/api/tokens/google/revoke', { method: 'POST' });
      await signIn('google', { callbackUrl: '/settings' });
    } catch { setRevoking(false); }
  }

  if (loading || !status) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Google Calendar</span>
        </div>
      </div>
    );
  }

  const isFullyConnected = status.connected && status.hasCalendarScope;
  const needsReconnect = status.connected && !status.hasCalendarScope;

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={isFullyConnected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Google Calendar</span>
          {isFullyConnected && <span className="text-emerald-400 text-xs">Connected</span>}
          {needsReconnect && <span className="text-amber-400 text-xs">Reconnect Required</span>}
        </div>
        {isFullyConnected && status.lastSync && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Class schedule, office hours, and personal events</p>

      {!status.connected && (
        <div>
          <p className="text-[#525252] text-xs mb-3">We only read your calendar — we never modify events.</p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/settings' })}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded transition-colors cursor-pointer"
          >
            Connect Google Calendar
          </button>
          <SetupGuide steps={SETUP_STEPS} />
        </div>
      )}

      {needsReconnect && (
        <div>
          <p className="text-amber-400 text-xs mb-3">
            Jarvis needs calendar access. Click Reconnect to revoke the existing session and grant calendar permissions.
          </p>
          <button
            onClick={handleReconnect}
            disabled={revoking}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded transition-colors cursor-pointer"
          >
            {revoking ? 'Revoking access...' : 'Reconnect'}
          </button>
          <p className="text-[#525252] text-xs mt-2">
            If reconnecting doesn&apos;t show a calendar permission prompt,{' '}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
              revoke Jarvis access on Google
            </a>
            {', then click Reconnect again.'}
          </p>
        </div>
      )}

      {isFullyConnected && (
        <div className="space-y-2">
          <div className="text-[#A3A3A3] text-xs">{status.eventCount} events synced</div>
        </div>
      )}
    </div>
  );
}
