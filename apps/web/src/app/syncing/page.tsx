'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, AlertCircle } from 'lucide-react';

interface ServiceStatus {
  status: string;
  lastSync: string | null;
  error: string | null;
  recordsFetched: number;
}

const SERVICE_CONFIG: { key: string; label: string; phase: number }[] = [
  { key: 'canvas', label: 'Canvas', phase: 1 },
  { key: 'ed', label: 'Ed Discussion', phase: 1 },
  { key: 'calendar', label: 'Calendar', phase: 1 },
  { key: 'gradescope', label: 'Gradescope', phase: 2 },
  { key: 'course_website', label: 'Course Websites', phase: 2 },
  { key: 'syllabus', label: 'Syllabus Extraction', phase: 3 },
];

export default function SyncingPage() {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [services, setServices] = useState<Record<string, ServiceStatus>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const doneRef = useRef(false);

  const getIcon = useCallback((svc: ServiceStatus | undefined) => {
    if (!svc) return <div className="w-3.5 h-3.5 rounded-full border border-[#525252]" />;
    if (svc.status === 'running') return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
    if (svc.status === 'success' || svc.status === 'partial') return <Check className="w-3.5 h-3.5 text-emerald-400" />;
    if (svc.status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    return <div className="w-3.5 h-3.5 rounded-full border border-[#525252]" />;
  }, []);

  const getLabel = useCallback((svc: ServiceStatus | undefined) => {
    if (!svc) return 'Waiting';
    if (svc.status === 'running') return 'Syncing...';
    if (svc.status === 'success') {
      return svc.recordsFetched ? `Done (${svc.recordsFetched} records)` : 'Done';
    }
    if (svc.status === 'partial') return 'Partial';
    if (svc.status === 'failed') return svc.error ? 'Skipped' : 'Failed';
    return svc.status;
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/sync/status');
        const data = await res.json();
        if (data.services) setServices(data.services);
        if (!data.isRunning && !doneRef.current) {
          doneRef.current = true;
          // Brief pause so user sees final state
          setTimeout(() => router.replace('/'), 1000);
        }
      } catch {
        // ignore poll errors
      }
    }, 2000);

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

  const hasAnyService = Object.keys(services).length > 0;
  const allDone = hasAnyService && !Object.values(services).some((s) => s.status === 'running');

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-4">
        {!allDone ? (
          <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        ) : (
          <div className="w-10 h-10 rounded-full border-2 border-emerald-500 flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
        )}
        <p className="text-sm text-[#F5F5F5] font-medium">
          {allDone ? 'Sync complete — redirecting...' : 'Syncing your data'}
        </p>
      </div>

      {/* Per-service checklist */}
      <div className="w-72 space-y-2">
        {SERVICE_CONFIG.map(({ key, label }) => {
          const svc = services[key];
          return (
            <div
              key={key}
              className={`flex items-center justify-between px-3 py-2 rounded-md border transition-colors ${
                svc?.status === 'running'
                  ? 'bg-[#111111] border-blue-500/30'
                  : svc
                    ? 'bg-[#111111] border-[#1F1F1F]'
                    : 'bg-[#0A0A0A] border-[#1F1F1F] opacity-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {getIcon(svc)}
                <span className="text-sm text-[#F5F5F5]">{label}</span>
              </div>
              <span className={`text-xs ${
                svc?.status === 'running' ? 'text-blue-400' :
                svc?.status === 'failed' ? 'text-red-400' :
                svc ? 'text-[#525252]' : 'text-[#525252]'
              }`}>
                {getLabel(svc)}
              </span>
            </div>
          );
        })}
      </div>

      {elapsed > 30 && !allDone && (
        <p className="text-xs text-[#525252] max-w-xs text-center">
          Taking a bit longer than usual — still working...
        </p>
      )}

      <button
        onClick={() => router.replace('/')}
        className="mt-2 text-xs text-[#525252] hover:text-[#A3A3A3] underline"
      >
        Skip and go to dashboard
      </button>
    </div>
  );
}
