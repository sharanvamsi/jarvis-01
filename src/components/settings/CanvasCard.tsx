'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import StatusDot from './StatusDot';
import { type SaveStatus, formatLastSync } from './types';

type CanvasStatus = {
  connected: boolean;
  lastSync: string | null;
  userExpiresAt: string | null;
  expiresInDays: number | null;
  syncStatus: string | null;
  syncError: string | null;
  recordsFetched: number;
};

export default function CanvasCard() {
  const router = useRouter();
  const [status, setStatus] = useState<CanvasStatus>({
    connected: false, lastSync: null, userExpiresAt: null,
    expiresInDays: null, syncStatus: null, syncError: null, recordsFetched: 0,
  });
  const [token, setToken] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [elapsedSyncSeconds, setElapsedSyncSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/canvas/status')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch status')))
      .then((data: CanvasStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  async function startSyncPolling() {
    setSyncState('syncing');
    setSyncError(null);
    setElapsedSyncSeconds(0);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    elapsedRef.current = setInterval(() => setElapsedSyncSeconds(s => s + 1), 1000);

    try {
      const triggerRes = await fetch('/api/sync/trigger', { method: 'POST' });
      if (triggerRes.status === 429) {
        // A sync is already running — our data will be included
        // Continue polling to detect when it finishes
      }
    } catch {
      // Pipeline unreachable — continue polling anyway
    }

    let attempts = 0;
    const maxAttempts = 40; // ~2 minutes

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/sync/status');
        if (!res.ok) return; // skip this poll cycle
        const data = await res.json();
        const canvasStatus = data.services?.canvas?.status;
        const canvasError = data.services?.canvas?.error;

        if (canvasStatus === 'success' || canvasStatus === 'partial') {
          clearInterval(pollRef.current!);
          if (elapsedRef.current) clearInterval(elapsedRef.current);
          setSyncState('done');
          fetchStatus();
          router.refresh();
        } else if (canvasStatus === 'failed') {
          clearInterval(pollRef.current!);
          if (elapsedRef.current) clearInterval(elapsedRef.current);
          setSyncState('error');
          setSyncError(canvasError ?? 'Sync failed — check your token');
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current!);
          if (elapsedRef.current) clearInterval(elapsedRef.current);
          setSyncState('done'); // may still be running in background
          fetchStatus();
          router.refresh();
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
  }

  async function handleSave() {
    if (!token.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/tokens/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          userExpiresAt: expiryDate || null,
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setToken('');
        setExpiryDate('');
        setShowUpdate(false);
        fetchStatus();
        startSyncPolling();
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch('/api/tokens/canvas', { method: 'DELETE' });
      if (!res.ok) return;
    } catch {
      return;
    }
    setShowDisconnect(false);
    setStatus({
      connected: false, lastSync: null, userExpiresAt: null,
      expiresInDays: null, syncStatus: null, syncError: null, recordsFetched: 0,
    });
    setSyncState('idle');
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Canvas</span>
        </div>
      </div>
    );
  }

  const tokenInput = (
    <div className="space-y-2">
      {/* Step-by-step instructions */}
      <div className="mb-3 space-y-1.5">
        <p className="text-xs font-medium text-[#F5F5F5]">How to get your Canvas token:</p>
        {[
          { text: 'Go to ', link: 'https://bcourses.berkeley.edu/profile/settings', label: 'bcourses.berkeley.edu/profile/settings' },
          { text: 'Scroll down to "Approved Integrations"' },
          { text: 'Click "+ New Access Token"' },
          { text: 'Name it "Jarvis", leave expiry blank, click Generate' },
          { text: 'Copy the token and paste it below' },
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-[#A3A3A3]">
            <span className="shrink-0 w-4 h-4 rounded-full bg-[#1F1F1F] text-[#525252] text-[10px] flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            <span>
              {step.link ? (
                <>{step.text}<a href={step.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">{step.label}</a></>
              ) : step.text}
            </span>
          </div>
        ))}
      </div>
      <input
        type="password"
        value={token}
        onChange={(e) => { setToken(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
        placeholder="Paste your Canvas access token"
        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors"
      />
      <div>
        <label className="text-xs text-[#525252]">
          Token expiry date
          <span className="ml-1">(optional — only if you set one)</span>
        </label>
        <input
          type="date"
          value={expiryDate}
          onChange={e => setExpiryDate(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded px-3 py-2 text-sm text-[#F5F5F5] mt-1"
        />
        <p className="text-[11px] text-[#525252] mt-0.5">
          Jarvis will remind you to refresh before it expires
        </p>
      </div>
    </div>
  );

  const getSyncMessage = (s: number) =>
    s < 10 ? 'Connecting to Canvas...' : s < 25 ? 'Fetching your courses and assignments...' : s < 45 ? 'Syncing grades and announcements...' : 'Almost done — finalizing your data...';

  const syncFeedback = (
    <>
      {syncState === 'syncing' && (
        <div className="flex items-center gap-2 mt-3 text-xs text-[#A3A3A3]">
          <div className="w-3 h-3 rounded-full border border-blue-500 border-t-transparent animate-spin shrink-0" />
          <span>{getSyncMessage(elapsedSyncSeconds)}</span>
        </div>
      )}
      {syncState === 'done' && (
        <div className="flex items-center gap-2 mt-3 text-xs text-emerald-500">
          <Check className="w-3 h-3" />
          <span>Sync complete — your data is now up to date</span>
        </div>
      )}
      {syncState === 'error' && (
        <div className="flex flex-col gap-1 mt-3">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <X className="w-3 h-3" />
            <span>{syncError}</span>
          </div>
          <button
            onClick={() => setSyncState('idle')}
            className="text-[11px] text-[#525252] hover:text-[#A3A3A3] text-left"
          >
            Try again &rarr;
          </button>
        </div>
      )}
    </>
  );

  return (
    <div id="canvas-card" className={`bg-[#111111] border rounded-md p-5 mb-4 ${
      !status.connected ? 'border-blue-500/30 border-l-2 border-l-blue-500' : 'border-[#1F1F1F]'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={status.connected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Canvas</span>
          {status.connected && <span className="text-emerald-400 text-xs">Connected</span>}
          {!status.connected && (
            <span className="text-[10px] text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5">Start here</span>
          )}
        </div>
        {status.connected && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Assignments, grades, and announcements from bCourses</p>

      {/* Token expiry warnings */}
      {status.connected && status.expiresInDays !== null && status.expiresInDays <= 7 && status.expiresInDays > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
          <span className="text-amber-400 shrink-0">{'\u26A0'}</span>
          <p className="text-amber-400">
            Token expires in {status.expiresInDays} day{status.expiresInDays !== 1 ? 's' : ''} &mdash;{' '}
            <button onClick={() => setShowUpdate(true)} className="underline">refresh it</button>
          </p>
        </div>
      )}
      {status.connected && status.expiresInDays !== null && status.expiresInDays <= 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
          <span className="text-red-400 shrink-0">{'\u2715'}</span>
          <p className="text-red-400">
            Token has expired &mdash;{' '}
            <button onClick={() => setShowUpdate(true)} className="underline">reconnect Canvas</button>
          </p>
        </div>
      )}

      {/* Last sync error */}
      {status.connected && status.syncError && (
        <div className="flex items-start gap-2 mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs">
          <span className="text-red-400 shrink-0 mt-0.5">{'\u26A0'}</span>
          <div>
            <p className="text-red-400">Last sync failed</p>
            <p className="text-[#A3A3A3] mt-0.5">{status.syncError}</p>
          </div>
        </div>
      )}

      {!status.connected && !showUpdate && (
        <div>
          {tokenInput}
          <button
            onClick={handleSave}
            disabled={!token.trim() || saveStatus === 'saving'}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors mt-2"
          >
            {saveStatus === 'saving' ? 'Connecting...' : 'Connect Canvas'}
          </button>
          {saveStatus === 'saved' && (
            <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Connected successfully</p>
          )}
          {saveStatus === 'error' && (
            <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3" /> Failed to save token</p>
          )}
          {syncFeedback}
        </div>
      )}

      {status.connected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { startSyncPolling(); }}
              disabled={syncState === 'syncing'}
              className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-4 py-2 rounded transition-colors flex items-center gap-2"
            >
              {syncState === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncState === 'syncing' ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => setShowUpdate(!showUpdate)}
              className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-4 py-2 rounded transition-colors flex items-center gap-1"
            >
              Update Token
              {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {syncFeedback}

          {showUpdate && (
            <div className="pt-2">
              {tokenInput}
              <button
                onClick={handleSave}
                disabled={!token.trim() || saveStatus === 'saving'}
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors mt-2"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Token'}
              </button>
              {saveStatus === 'saved' && (
                <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Token updated</p>
              )}
              {saveStatus === 'error' && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3" /> Failed to update token</p>
              )}
            </div>
          )}

          {!showDisconnect ? (
            <button onClick={() => setShowDisconnect(true)} className="text-red-400 hover:text-red-300 text-sm transition-colors">
              Disconnect
            </button>
          ) : (
            <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded p-3">
              <p className="text-[#A3A3A3] text-sm mb-2">Are you sure? This will remove your Canvas token and stop syncing.</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleDisconnect} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm px-3 py-1.5 rounded transition-colors">Confirm</button>
                <button type="button" onClick={() => setShowDisconnect(false)} className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-3 py-1.5 rounded transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
