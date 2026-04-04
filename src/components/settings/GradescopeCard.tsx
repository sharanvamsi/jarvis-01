'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, lastSync: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showUpdate, setShowUpdate] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    fetch('/api/tokens/gradescope/status')
      .then((r) => r.json())
      .then((data: ConnectionStatus) => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleSave() {
    if (!email.trim() || !password.trim()) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/tokens/gradescope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      if (res.ok) { setSaveStatus('saved'); setEmail(''); setPassword(''); setShowUpdate(false); fetchStatus(); }
      else setSaveStatus('error');
    } catch { setSaveStatus('error'); }
  }

  async function handleDisconnect() {
    await fetch('/api/tokens/gradescope', { method: 'DELETE' });
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
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <StatusDot connected={status.connected} />
          <span className="text-[#F5F5F5] text-sm font-medium">Gradescope</span>
          {status.connected && <span className="text-emerald-400 text-xs">Connected</span>}
        </div>
        {status.connected && (
          <span className="text-[#525252] text-xs">{formatLastSync(status.lastSync)}</span>
        )}
      </div>
      <p className="text-[#525252] text-xs mb-4">Detailed scores and submission status</p>

      {!status.connected && !showUpdate && (
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
              onClick={() => { setSyncing(true); setTimeout(() => { setSyncing(false); fetchStatus(); }, 1500); }}
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
              Update Credentials
              {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

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
