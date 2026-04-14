'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Settings, ArrowRight, Check, Globe, Lock } from 'lucide-react';
import { SignInButton } from '@/components/auth/SignInButton';
import CourseSelectionList, { type CourseCandidate } from '@/components/settings/CourseSelectionList';

type Step = 'signin' | 'canvas' | 'courses' | 'gradescope' | 'websites' | 'done';

export default function Onboarding() {
  const [step, setStep] = useState<Step>('signin');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session, status } = useSession();
  const router = useRouter();

  // Canvas token state
  const [token, setToken] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  // Course selection state
  const [courses, setCourses] = useState<CourseCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingCourses, setSavingCourses] = useState(false);

  // Gradescope state
  const [gsEmail, setGsEmail] = useState('');
  const [gsPassword, setGsPassword] = useState('');
  const [savingGs, setSavingGs] = useState(false);
  const [gsConnected, setGsConnected] = useState(false);

  // Website URL state
  const [createdCourses, setCreatedCourses] = useState<{id: string; courseCode: string; courseName: string}[]>([]);
  const [websiteUrls, setWebsiteUrls] = useState<Record<string, string>>({});
  const [savingWebsites, setSavingWebsites] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && step === 'signin') {
      setStep('canvas');
    }
  }, [status, step]);

  const stepIndex = { signin: 0, canvas: 1, courses: 2, gradescope: 3, websites: 4, done: 5 };
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  // ── Step 2: Save Canvas token ──────────────────────────────
  async function handleSaveToken() {
    if (!token.trim()) return;
    setSavingToken(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/canvas-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to validate token');

      // Token validated — courses returned
      const courseCandidates: CourseCandidate[] = (data.courses ?? []).map(
        (c: { canvasId: string; courseCode: string; courseName: string; term: string }) => ({
          canvasId: c.canvasId,
          courseCode: c.courseCode,
          courseName: c.courseName,
          term: c.term,
        })
      );
      setCourses(courseCandidates);
      setSelectedIds(courseCandidates.map(c => c.canvasId));
      setStep('courses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Canvas');
    } finally {
      setSavingToken(false);
    }
  }

  // ── Step 3: Confirm course selection ───────────────────────
  async function handleConfirmCourses() {
    if (selectedIds.length === 0) return;
    setSavingCourses(true);
    setError(null);
    try {
      const selectedCourses = courses.filter(c => selectedIds.includes(c.canvasId));
      const res = await fetch('/api/onboarding/create-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courses: selectedCourses.map(c => ({
            canvasId: c.canvasId,
            courseCode: c.courseCode,
            courseName: c.courseName,
            term: c.term,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to save selected courses');
      }
      // Store created courses for the website URL step
      const created = data?.courses ?? [];
      setCreatedCourses(created);
      const initUrls: Record<string, string> = {};
      for (const c of created) initUrls[c.id] = '';
      setWebsiteUrls(initUrls);
      setStep('gradescope');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selected courses');
    } finally {
      setSavingCourses(false);
    }
  }

  // ── Step 4: Connect Gradescope ─────────────────────────────
  async function handleConnectGradescope() {
    if (!gsEmail.trim() || !gsPassword.trim()) return;
    setSavingGs(true);
    setError(null);
    try {
      const res = await fetch('/api/tokens/gradescope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gsEmail.trim(), password: gsPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect Gradescope');
      setGsConnected(true);
      setTimeout(() => setStep('websites'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Gradescope');
    } finally {
      setSavingGs(false);
    }
  }

  // ── Step 5: Save website URLs ─────────────────────────────
  async function handleSaveWebsites() {
    setSavingWebsites(true);
    setError(null);
    try {
      const entries = Object.entries(websiteUrls).filter(([, url]) => url.trim());
      await Promise.allSettled(
        entries.map(([courseId, url]) =>
          fetch(`/api/courses/${courseId}/website`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.trim() }),
          })
        )
      );
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save website URLs');
    } finally {
      setSavingWebsites(false);
    }
  }

  // ── Step 5: Complete onboarding ────────────────────────────
  async function handleFinish(destination: '/settings' | '/' | '/syncing') {
    setIsLoading(true);
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' });
    } catch {
      // Best-effort — don't block navigation
    }
    router.push(destination);
  }

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
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                stepIndex[step] >= i ? 'bg-[#3B82F6]' : 'bg-[#1F1F1F]'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-8">

          {/* ── STEP 1: Sign In ──────────────────────────── */}
          {step === 'signin' && (
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

          {/* ── STEP 2: Canvas Token ─────────────────────── */}
          {step === 'canvas' && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-2">
                Connect Canvas
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-6">
                Jarvis needs your Canvas access token to import assignments, grades, and announcements.
              </p>

              <div className="mb-4 space-y-1.5">
                <p className="text-xs font-medium text-[#F5F5F5]">How to get your Canvas token:</p>
                {[
                  { text: 'Go to ', link: 'https://bcourses.berkeley.edu/profile/settings', label: 'bcourses.berkeley.edu/profile/settings' },
                  { text: 'Scroll down to "Approved Integrations"' },
                  { text: 'Click "+ New Access Token"' },
                  { text: 'Name it "Jarvis", leave expiry blank, click Generate' },
                  { text: 'Copy the token and paste it below' },
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#A3A3A3]">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[#1F1F1F] text-[#525252] text-[10px] flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span>
                      {s.link ? (
                        <>{s.text}<a href={s.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">{s.label}</a></>
                      ) : s.text}
                    </span>
                  </div>
                ))}
              </div>

              <input
                type="password"
                value={token}
                onChange={e => { setToken(e.target.value); setError(null); }}
                placeholder="Paste your Canvas access token"
                className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors mb-2"
              />

              <div className="mb-4">
                <label className="text-xs text-[#525252]">
                  Token expiry date
                  <span className="ml-1">(optional)</span>
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded px-3 py-2 text-sm text-[#F5F5F5] mt-1"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs mb-3">{error}</p>
              )}

              <button
                onClick={handleSaveToken}
                disabled={!token.trim() || savingToken}
                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-2"
              >
                {savingToken ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Validating...</>
                ) : (
                  'Connect Canvas'
                )}
              </button>

              <button
                onClick={() => {
                  fetch('/api/onboarding/complete-simple', { method: 'POST' }).catch(() => {});
                  router.push('/');
                }}
                className="w-full text-[#525252] hover:text-[#A3A3A3] text-xs py-2 mt-2 transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP 3: Course Selection ─────────────────── */}
          {step === 'courses' && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-1">
                Select your courses
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-5">
                Choose the courses you&apos;re taking this semester. We&apos;ll only sync data for these courses.
              </p>

              {courses.length === 0 && (
                <p className="text-[#525252] text-sm">No active courses found in Canvas.</p>
              )}

              {courses.length > 0 && (
                <div className="max-h-[320px] overflow-y-auto pr-1 -mr-1">
                  <CourseSelectionList
                    courses={courses}
                    selectedIds={selectedIds}
                    onChange={(ids) => {
                      setSelectedIds(ids);
                      setError(null);
                    }}
                  />
                </div>
              )}

              {error && (
                <p className="text-red-400 text-xs mt-3">{error}</p>
              )}

              <button
                onClick={handleConfirmCourses}
                disabled={selectedIds.length === 0 || savingCourses}
                className="w-full mt-4 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-2"
              >
                {savingCourses ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  `Continue with ${selectedIds.length} course${selectedIds.length !== 1 ? 's' : ''}`
                )}
              </button>

              {selectedIds.length === 0 && (
                <p className="text-red-400 text-xs mt-2 text-center">
                  Select at least one course to continue
                </p>
              )}
            </div>
          )}

          {/* ── STEP 4: Gradescope ─────────────────────── */}
          {step === 'gradescope' && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-2">
                Connect Gradescope
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-6">
                Link your Gradescope account to sync grades and submissions.
              </p>

              {gsConnected ? (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-emerald-400 text-sm font-medium">Connected successfully</span>
                </div>
              ) : (
                <>
                  <p className="text-[#525252] text-xs mb-4">
                    Sign in with CalNet?{' '}
                    <a
                      href="https://www.gradescope.com/account/edit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Create a Gradescope password
                    </a>{' '}
                    first, then use that email and password here.
                  </p>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-[#A3A3A3] mb-1 block">Email</label>
                      <input
                        type="email"
                        value={gsEmail}
                        onChange={e => { setGsEmail(e.target.value); setError(null); }}
                        placeholder="you@berkeley.edu"
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#A3A3A3] mb-1 block">Password</label>
                      <input
                        type="password"
                        value={gsPassword}
                        onChange={e => { setGsPassword(e.target.value); setError(null); }}
                        placeholder="Gradescope password"
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <p className="text-[#525252] text-xs mb-4 flex items-start gap-1.5">
                    <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                    Your credentials are encrypted with AES-256-GCM and never stored in plaintext.
                  </p>

                  {error && (
                    <p className="text-red-400 text-xs mb-3">{error}</p>
                  )}

                  <button
                    onClick={handleConnectGradescope}
                    disabled={!gsEmail.trim() || !gsPassword.trim() || savingGs}
                    className="w-full bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-2"
                  >
                    {savingGs ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                    ) : (
                      'Connect Gradescope'
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() => setStep('websites')}
                className="w-full text-[#525252] hover:text-[#A3A3A3] text-xs py-2 mt-2 transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP 5: Website URLs ───────────────────── */}
          {step === 'websites' && (
            <div>
              <h2 className="text-[#F5F5F5] text-2xl font-medium mb-1">
                Add course websites
              </h2>
              <p className="text-[#A3A3A3] text-sm mb-5">
                If your courses have dedicated websites, add them here. We&apos;ll sync assignments, office hours, and staff info.
              </p>

              {createdCourses.length > 0 && (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 -mr-1">
                  {createdCourses.map((course) => (
                    <div key={course.id}>
                      <label className="text-[#F5F5F5] text-xs font-medium flex items-center gap-1.5 mb-1">
                        <Globe className="w-3 h-3 text-[#525252]" />
                        {course.courseCode}
                      </label>
                      <input
                        type="url"
                        value={websiteUrls[course.id] ?? ''}
                        onChange={(e) =>
                          setWebsiteUrls((prev) => ({ ...prev, [course.id]: e.target.value }))
                        }
                        placeholder="https://cs61b.org"
                        className="w-full bg-[#0A0A0A] border border-[#1F1F1F] rounded text-[#F5F5F5] text-sm px-3 py-2 placeholder-[#525252] outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-xs mt-3">{error}</p>
              )}

              <button
                onClick={handleSaveWebsites}
                disabled={savingWebsites}
                className="w-full mt-4 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-2.5 px-4 rounded transition-colors flex items-center justify-center gap-2"
              >
                {savingWebsites ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  'Continue'
                )}
              </button>

              <button
                onClick={() => setStep('done')}
                className="w-full text-[#525252] hover:text-[#A3A3A3] text-xs py-2 mt-2 transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── STEP 5: Done ─────────────────────────────── */}
          {step === 'done' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <h2 className="text-[#F5F5F5] text-2xl font-medium">
                  You&apos;re all set, {firstName}!
                </h2>
              </div>
              <p className="text-[#A3A3A3] text-sm mb-6">
                {selectedIds.length > 0
                  ? `Syncing ${selectedIds.length} course${selectedIds.length !== 1 ? 's' : ''}. Your dashboard will be ready in about 15 seconds.`
                  : 'Your data is syncing. The dashboard will be ready shortly.'}
              </p>

              <p className="text-[#525252] text-xs mb-6">
                You can also connect Ed Discussion in Settings for richer data.
              </p>

              <button
                onClick={() => handleFinish('/syncing')}
                disabled={isLoading}
                className="w-full bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#1F1F1F] disabled:text-[#525252] text-white font-medium py-3 px-4 rounded transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                Go to dashboard
              </button>

              <button
                onClick={() => handleFinish('/settings')}
                disabled={isLoading}
                className="w-full text-[#A3A3A3] hover:text-[#F5F5F5] text-sm py-2 transition-colors flex items-center justify-center gap-1"
              >
                <Settings className="w-3.5 h-3.5" />
                Set up more integrations
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
