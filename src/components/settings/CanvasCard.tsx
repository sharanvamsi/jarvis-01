'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, X, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import StatusDot from './StatusDot';
import SetupGuide from './SetupGuide';
import { type ConnectionStatus, type SaveStatus, formatLastSync } from './types';

const SETUP_STEPS = [
  { text: 'Go to', link: { label: 'bcourses.berkeley.edu', href: 'https://bcourses.berkeley.edu' } },
  { text: 'Click your profile icon → Settings' },
  { text: 'Scroll to "Approved Integrations" → "+ New Access Token"' },
  { text: 'Name it (e.g., "Jarvis"), click "Generate Token"' },
  { text: 'Copy the token and paste it above' },
];

export default function CanvasCard() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, lastSync: null });
  const [token, setToken] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/canvas/status')
      .then((r) => r.json())
      .then((data: ConnectionStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleSave() {
    if (!token.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/tokens/canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) { setSaveStatus('saved'); setToken(''); setShowUpdate(false); fetchStatus(); }
      else setSaveStatus('error');
    } catch { setSaveStatus('error'); }
  }

  async function handleDisconnect() {
    await fetch('/api/tokens/canvas', { method: 'DELETE' });
    setShowDisconnect(false);
    setStatus({ connected: false, lastSync: null });
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

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={status.connected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Canvas</span>
          {status.connected && <span className="text-emerald-400 text-xs">Connected</span>}
        </div>
        {status.connected && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Assignments, grades, and announcements from bCourses</p>

      {!status.connected && !showUpdate && (
        <div>
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
            placeholder="Paste your Canvas access token"
            className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
          />
          <button
            onClick={handleSave}
            disabled={!token.trim() || saveStatus === 'saving'}
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:bg-[#1F1F1F] disabled:text-[#525252] transition-colors"
          >
            {saveStatus === 'saving' ? 'Connecting...' : 'Connect Canvas'}
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
              onClick={() => { setSyncing(true); setTimeout(() => setSyncing(false), 1500); }}
              disabled={syncing}
              className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-4 py-2 rounded transition-colors flex items-center gap-2"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => setShowUpdate(!showUpdate)}
              className="bg-[#1F1F1F] hover:bg-[#2a2a2a] text-[#A3A3A3] text-sm px-4 py-2 rounded transition-colors flex items-center gap-1"
            >
              Update Token
              {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showUpdate && (
            <div className="pt-2">
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); if (saveStatus !== 'idle') setSaveStatus('idle'); }}
                placeholder="Paste new Canvas access token"
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
              <p className="text-[#A3A3A3] text-sm mb-2">Are you sure? This will remove your Canvas token and stop syncing.</p>
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
