'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import StatusDot from './StatusDot';
import SetupGuide from './SetupGuide';
import { type ConnectionStatus, type SaveStatus, formatLastSync } from './types';

const SETUP_STEPS = [
  { text: 'Use the same email and password you use to sign in at', link: { label: 'gradescope.com', href: 'https://www.gradescope.com' } },
  { text: 'Jarvis uses read-only access — it never submits or modifies your work' },
  { text: 'Credentials are encrypted with AES-256-GCM before storage' },
];

export default function GradescopeCard() {
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, lastSync: null });
  const [canvasConnected, setCanvasConnected] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/gradescope/status')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch status')))
      .then((data: ConnectionStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
    fetch('/api/tokens/canvas/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCanvasConnected(data.connected); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function startSyncPolling() {
    setSyncState('syncing');
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/sync/status');
        if (!res.ok) return;
        const data = await res.json();
        const gsStatus = data.services?.gradescope?.status;
        if (gsStatus === 'success' || gsStatus === 'partial' || attempts >= 30) {
          clearInterval(pollRef.current!);
          setSyncState('done');
          fetchStatus();
          // Re-fetch status after a delay to catch late syncLog writes
          setTimeout(fetchStatus, 5000);
          router.refresh();
        }
      } catch {}
    }, 3000);
  }

  async function handleSave() {
    if (!email.trim() || !password.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/tokens/gradescope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      if (res.ok) { setSaveStatus('saved'); setEmail(''); setPassword(''); setShowUpdate(false); fetchStatus(); startSyncPolling(); }
      else setSaveStatus('error');
    } catch { setSaveStatus('error'); }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch('/api/tokens/gradescope', { method: 'DELETE' });
      if (!res.ok) return;
    } catch {
      return;
    }
    setShowDisconnect(false);
    setStatus({ connected: false, lastSync: null });
  }

  const credentialInputs = (
    <>
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
        placeholder="Gradescope email"
        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
        placeholder="Gradescope password"
        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
      />
    </>
  );

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Gradescope</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4${!canvasConnected && !status.connected ? ' opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={status.connected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Gradescope</span>
          {status.connected && <span className="text-emerald-400 text-xs">Connected</span>}
          {!canvasConnected && !status.connected && (
            <span className="text-[10px] text-[#525252] bg-[#1F1F1F] rounded px-1.5 py-0.5">Requires Canvas</span>
          )}
        </div>
        {status.connected && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Detailed scores and submission status</p>

      {status.connected && status.syncError && (
        <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-red-500/5 border border-red-500/20">
          <span className="text-red-400 text-xs mt-0.5">{'\u26A0'}</span>
          <p className="text-xs text-red-400">{status.syncError}</p>
        </div>
      )}

      {!status.connected && !showUpdate && !canvasConnected && (
        <div>
          <p className="text-xs text-[#525252]">
            Connect Canvas first to enable Gradescope integration. Gradescope needs your course list to match grades to assignments.
          </p>
          <a
            href="#canvas-card"
            className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Connect Canvas first
          </a>
        </div>
      )}

      {!status.connected && !showUpdate && canvasConnected && (
        <div>
          {credentialInputs}
          <p className="text-[#525252] text-xs mb-3">
            Your credentials are encrypted with AES-256-GCM before storage. We never submit or modify your work — read only.
          </p>
          <button
            onClick={handleSave}
            disabled={!email.trim() || !password.trim() || saveStatus === 'saving'}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors"
          >
            {saveStatus === 'saving' ? 'Connecting...' : 'Connect Gradescope'}
          </button>
          {saveStatus === 'saved' && (
            <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Connected successfully</p>
          )}
          {saveStatus === 'error' && (
            <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3" /> Failed to save credentials</p>
          )}
          <SetupGuide steps={SETUP_STEPS} />
        </div>
      )}

      {status.connected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetch('/api/sync/trigger', { method: 'POST' }).catch(() => {}); startSyncPolling(); }}
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
              Update Credentials
              {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {syncState === 'done' && (
            <div className="flex items-center gap-2 text-xs text-emerald-500">
              <Check className="w-3 h-3" />
              <span>Sync complete</span>
            </div>
          )}

          {showUpdate && (
            <div className="pt-2">
              {credentialInputs}
              <button
                onClick={handleSave}
                disabled={!email.trim() || !password.trim() || saveStatus === 'saving'}
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors"
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Credentials'}
              </button>
              {saveStatus === 'saved' && (
                <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Credentials updated</p>
              )}
              {saveStatus === 'error' && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3" /> Failed to update credentials</p>
              )}
            </div>
          )}

          {!showDisconnect ? (
            <button onClick={() => setShowDisconnect(true)} className="text-red-400 hover:text-red-300 text-sm transition-colors">
              Disconnect
            </button>
          ) : (
            <div className="bg-[#0A0A0A] border border-[#1F1F1F] rounded p-3">
              <p className="text-[#A3A3A3] text-sm mb-2">Are you sure? This will remove your Gradescope credentials and stop syncing.</p>
              <div className="flex items-center gap-2">
                <button onClick={handleDisconnect} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm px-3 py-1.5 rounded transition-colors">Confirm</button>
                <button onClick={() => setShowDisconnect(false)} className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-3 py-1.5 rounded transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
