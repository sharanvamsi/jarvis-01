'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Trash2, Loader2 } from 'lucide-react';

export default function DeleteAccountSection() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [reason, setReason] = useState('');

  async function handleDelete() {
    setStep('deleting');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (res.ok) {
        signOut({ callbackUrl: '/onboarding' });
      } else {
        setStep('confirm');
      }
    } catch {
      setStep('confirm');
    }
  }

  return (
    <div className="mt-10">
      <h2 className="text-[#F5F5F5] text-sm font-medium mb-4">Account Deletion</h2>
      <div className="bg-[#111111] border border-red-500/20 rounded-md p-6">
        {step === 'idle' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[#F5F5F5] text-sm">Delete your account</p>
              <p className="text-[#525252] text-xs mt-0.5">
                Permanently delete your account and all synced data. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setStep('confirm')}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white transition-colors shrink-0 ml-4"
            >
              <Trash2 className="w-4 h-4" />
              Delete my account
            </button>
          </div>
        )}

        {(step === 'confirm' || step === 'deleting') && (
          <div>
            <label className="text-[#A3A3A3] text-sm block mb-1">
              Why are you deleting your account?{' '}
              <span className="text-[#525252]">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Your feedback helps us improve Jarvis..."
              rows={3}
              disabled={step === 'deleting'}
              className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-red-500/50 transition-colors resize-none mb-3 disabled:opacity-50"
            />
            <div className="bg-red-500/5 border border-red-500/10 rounded p-4 mb-4">
              <p className="text-red-400 text-xs font-medium mb-2">This will permanently delete:</p>
              <ul className="text-[#A3A3A3] text-xs space-y-1.5 list-disc list-inside">
                <li>All synced courses, assignments, and grades</li>
                <li>Calendar events and announcements</li>
                <li>All connected service tokens</li>
                <li>Your account and login credentials</li>
              </ul>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => { setStep('idle'); setReason(''); }}
                disabled={step === 'deleting'}
                className="px-3 py-1.5 rounded text-sm text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#161616] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={step === 'deleting'}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
              >
                {step === 'deleting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</>
                ) : (
                  'Yes, delete everything'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
