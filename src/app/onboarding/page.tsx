'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { Loader2, Settings, ArrowRight } from 'lucide-react';
import { SignInButton } from '@/components/auth/SignInButton';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      if (step === 1) setStep(2);
    }
  }, [status, step]);

  async function handleComplete(destination: '/settings' | '/') {
    setIsLoading(true);
    try {
      const res = await fetch('/api/onboarding/complete-simple', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      router.push(destination);
    } catch {
      setIsLoading(false);
    }
  }

  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-8">
      <div className="w-full max-w-[480px]">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[#3B82F6] flex items-center justify-center">
              <span className="text-white font-semibold">J</span>
            </div>
            <span className="text-[#F5F5F5] text-xl font-semibold">Jarvis</span>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2].map((num) => (
            <div
              key={num}
              className={`w-2 h-2 rounded-full transition-colors ${
                step >= num ? 'bg-[#3B82F6]' : 'bg-[#1F1F1F]'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-8">
          {step === 1 && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-2">
                Connect your Google account
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-8">
                Your academic command center. Sign in with your Berkeley Google account to sync assignments, grades, and calendar.
              </p>

              <div className="mb-4">
                <SignInButton />
              </div>

              <p className="text-[#525252] text-xs text-center">
                Jarvis respects your privacy. We only access calendar and email data needed for academic tracking.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-2">
                Welcome to Jarvis, {firstName}!
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-6">
                Your data syncs automatically once connected.
                Most students are up and running in under 2 minutes.
              </p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-[#A3A3A3] text-sm">
                  <div className="w-6 h-6 rounded bg-[#1F1F1F] flex items-center justify-center shrink-0">
                    <span className="text-xs text-[#525252]">1</span>
                  </div>
                  <span>Connect Canvas &mdash; paste your bCourses access token</span>
                </div>
                <div className="flex items-center gap-3 text-[#A3A3A3] text-sm">
                  <div className="w-6 h-6 rounded bg-[#1F1F1F] flex items-center justify-center shrink-0">
                    <span className="text-xs text-[#525252]">2</span>
                  </div>
                  <span>Optionally add Gradescope and Ed Discussion</span>
                </div>
                <div className="flex items-center gap-3 text-[#A3A3A3] text-sm">
                  <div className="w-6 h-6 rounded bg-[#1F1F1F] flex items-center justify-center shrink-0">
                    <span className="text-xs text-[#525252]">3</span>
                  </div>
                  <span>Confirm your grade weights on the Grades page</span>
                </div>
              </div>

              <button
                onClick={() => handleComplete('/settings')}
                disabled={isLoading}
                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-3 px-4 rounded transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
                Set up integrations
              </button>

              <button
                onClick={() => handleComplete('/')}
                disabled={isLoading}
                className="w-full text-[#A3A3A3] hover:text-[#F5F5F5] text-sm py-2 transition-colors flex items-center justify-center gap-1"
              >
                Go to dashboard
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
