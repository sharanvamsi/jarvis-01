'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncingPage() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Connecting to Canvas...');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const messages = [
    { at: 0,  text: 'Connecting to Canvas...' },
    { at: 3,  text: 'Fetching your courses and assignments...' },
    { at: 8,  text: 'Syncing grades and submissions...' },
    { at: 14, text: 'Almost there...' },
  ];

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(s => {
        const next = s + 1;
        const msg = [...messages]
          .reverse()
          .find(m => next >= m.at);
        if (msg) setStatusMessage(msg.text);
        return next;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        if (!data.isRunning) {
          clearInterval(pollRef.current!);
          clearInterval(timerRef.current!);
          router.replace('/');
        }
      } catch {
        // ignore poll errors
      }
    }, 3000);

    const timeout = setTimeout(() => {
      clearInterval(pollRef.current!);
      clearInterval(timerRef.current!);
      router.replace('/');
    }, 90_000);

    return () => {
      clearInterval(pollRef.current!);
      clearInterval(timerRef.current!);
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <p className="text-sm text-[#F5F5F5] font-medium">{statusMessage}</p>
        <p className="text-xs text-[#525252]">
          This usually takes about 15 seconds
        </p>
      </div>

      {elapsed > 20 && (
        <p className="text-xs text-[#525252] max-w-xs text-center">
          Taking a bit longer than usual — still working...
        </p>
      )}

      <button
        onClick={() => router.replace('/')}
        className="mt-4 text-xs text-[#525252] hover:text-[#A3A3A3] underline"
      >
        Skip and go to dashboard
      </button>
    </div>
  );
}
