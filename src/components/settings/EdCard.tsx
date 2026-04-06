'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import StatusDot from './StatusDot';
import SetupGuide from './SetupGuide';
import { type ConnectionStatus, type SaveStatus, formatLastSync } from './types';

const SETUP_STEPS = [
  { text: 'Go to', link: { label: 'edstem.org/us/settings/api-tokens', href: 'https://edstem.org/us/settings/api-tokens' } },
  { text: 'Click "Generate new API token"' },
  { text: 'Copy the token and paste it above' },
];

export default function EdCard() {
  const router = useRouter();
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, lastSync: null });
  const [canvasConnected, setCanvasConnected] = useState(true); // assume true until checked
  const [token, setToken] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/ed/status')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to fetch status')))
      .then((data: ConnectionStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
    // Also check Canvas status for the warning
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
        const edStatus = data.services?.ed?.status;
        if (edStatus === 'success' || edStatus === 'partial' || attempts >= 30) {
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
    if (!token.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/tokens/ed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) { setSaveStatus('saved'); setToken(''); setShowUpdate(false); fetchStatus(); startSyncPolling(); }
      else setSaveStatus('error');
    } catch { setSaveStatus('error'); }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch('/api/tokens/ed', { method: 'DELETE' });
      if (!res.ok) return;
    } catch {
      return;
    }
    setShowDisconnect(false);
    setStatus({ connected: false, lastSync: null });
  }

  if (loading) {
    return (
      <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#525252]" />
          <span className="text-[#F5F5F5] text-sm font-medium">Ed Discussion</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4${!canvasConnected && !status.connected ? ' opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={status.connected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Ed Discussion</span>
          {status.connected && <span className="text-emerald-400 text-xs">Connected</span>}
          {!canvasConnected && !status.connected && (
            <span className="text-[10px] text-[#525252] bg-[#1F1F1F] rounded px-1.5 py-0.5">Requires Canvas</span>
          )}
        </div>
        {status.connected && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Announcements and questions from Ed</p>

      {!status.connected && !showUpdate && !canvasConnected && (
        <div>
          <p className="text-xs text-[#525252]">
            Connect Canvas first to enable Ed integration. Ed needs your course list to sync announcements and threads.
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
          {/* Step-by-step instructions */}
          <div className="mb-3 space-y-1.5">
            <p className="text-xs font-medium text-[#F5F5F5]">How to get your Ed token:</p>
            {[
              { text: 'Go to ', link: 'https://edstem.org/us/settings/api-tokens', label: 'edstem.org/us/settings/api-tokens' },
              { text: 'Click "Generate new API token"' },
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
            placeholder="Paste your Ed API token"
            className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
          />
          <button
            onClick={handleSave}
            disabled={!token.trim() || saveStatus === 'saving'}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors"
          >
            {saveStatus === 'saving' ? 'Connecting...' : 'Connect Ed'}
          </button>
          {saveStatus === 'saved' && (
            <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1"><Check className="w-3 h-3" /> Connected successfully</p>
          )}
          {saveStatus === 'error' && (
            <p className="text-red-400 text-xs mt-2 flex items-center gap-1"><X className="w-3 h-3" /> Failed to save token</p>
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
              Update Token
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
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
                placeholder="Paste new Ed API token"
                className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
              />
              <button
                onClick={handleSave}
                disabled={!token.trim() || saveStatus === 'saving'}
                className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors"
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
              <p className="text-[#A3A3A3] text-sm mb-2">Are you sure? This will remove your Ed token and stop syncing.</p>
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
