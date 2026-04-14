"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  MessageCircle,
  CalendarDays,
  Link2,
  Menu,
  X,
} from "lucide-react";

const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

export function WelcomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] overflow-x-hidden">
      {/* Navbar — minimal, no fuss */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1F1F1F] bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-6 flex items-center justify-between h-14">
          <Link href="/welcome" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#3B82F6] flex items-center justify-center">
              <span className="text-white text-sm font-semibold">J</span>
            </div>
            <span className="text-[#F5F5F5] font-semibold">Jarvis</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <a
              href="#how"
              className="text-[13px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
            >
              How it works
            </a>
            <Link
              href="/onboarding"
              className="text-[13px] font-medium text-[#F5F5F5] hover:text-white transition-colors"
            >
              Sign in
            </Link>
          </div>

          <button
            className="md:hidden p-2 text-[#A3A3A3] hover:text-[#F5F5F5]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1F1F1F] bg-[#0A0A0A]/95 backdrop-blur-md px-6 py-4 flex flex-col gap-3">
            <a
              href="#how"
              className="text-sm text-[#525252] hover:text-[#A3A3A3] transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it works
            </a>
            <Link
              href="/onboarding"
              className="text-sm font-medium text-[#F5F5F5]"
            >
              Sign in
            </Link>
          </div>
        )}
      </nav>

      {/* Hero — direct, specific, shows the product */}
      <section className="relative min-h-[90vh] flex items-center justify-center">
        <div className="absolute inset-0 z-0 opacity-40">
          <HeroCanvas
            colors={[
              [255, 255, 255],
              [59, 130, 246],
            ]}
            dotSize={3}
            animationSpeed={2}
          />
        </div>
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,rgba(10,10,10,0.6)_0%,rgba(10,10,10,0.95)_70%)]" />

        <div className="relative z-10 max-w-3xl mx-auto px-6 pt-24 pb-16">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            Stop checking five{" "}
            <br className="hidden md:block" />
            different websites{" "}
            <span className="text-[#525252]">every morning.</span>
          </h1>

          <p className="mt-6 text-[#A3A3A3] text-base md:text-lg leading-relaxed max-w-xl">
            Jarvis pulls your grades, assignments, discussions, and schedule
            from Canvas, Gradescope, Ed, and Google Calendar into one
            dashboard. Set up in 3 minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
            <Link
              href="/onboarding"
              className="group inline-flex items-center gap-2 bg-[#F5F5F5] text-[#0A0A0A] px-6 py-3 text-sm font-semibold hover:bg-white transition-colors"
            >
              Get started
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <span className="text-[13px] text-[#525252] pt-2 sm:pt-3">
              Free &middot; Google sign-in &middot; No install
            </span>
          </div>

          {/* Mini product preview — shows actual structure */}
          <div className="mt-16 rounded-lg border border-[#1F1F1F] bg-[#111111] overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#1F1F1F]">
              <div className="w-2 h-2 rounded-full bg-[#525252]" />
              <div className="w-2 h-2 rounded-full bg-[#525252]" />
              <div className="w-2 h-2 rounded-full bg-[#525252]" />
              <span className="ml-3 text-[11px] text-[#525252] font-mono">
                jarvis — dashboard
              </span>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <DashboardMiniCard label="Due soon" value="3" sub="assignments" accent="#F59E0B" />
              <DashboardMiniCard label="Missing" value="1" sub="past due" accent="#EF4444" />
              <DashboardMiniCard label="Graded" value="12" sub="this week" accent="#10B981" />
              <DashboardMiniCard label="Classes today" value="2" sub="next: 2pm" accent="#3B82F6" />
            </div>
            <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3">
                <span className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">
                  Recent grades
                </span>
                <div className="mt-2.5 space-y-2">
                  <GradeRow course="CS 162" name="HW 5" score="87/100" color="#3B82F6" />
                  <GradeRow course="CS 189" name="MT 1" score="72/85" color="#8B5CF6" />
                  <GradeRow course="UGBA 103" name="Case 3" score="46/50" color="#10B981" />
                </div>
              </div>
              <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3">
                <span className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">
                  Ed Discussion
                </span>
                <div className="mt-2.5 space-y-2">
                  <EdRow title="MT1 grade distribution?" votes={24} answers={3} />
                  <EdRow title="HW6 Q3 clarification" votes={18} answers={7} />
                  <EdRow title="OH cancelled this week?" votes={12} answers={1} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — concrete, not abstract */}
      <section id="how" className="py-20 px-6 border-t border-[#1F1F1F]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-sm font-medium text-[#525252] uppercase tracking-wider mb-10">
            5 data sources. 1 dashboard. 3-minute setup.
          </h2>

          {/* Bento grid — asymmetric, not uniform */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Canvas — large card */}
            <div className="md:col-span-4 rounded-lg border border-[#1F1F1F] bg-[#111111] p-6 flex flex-col justify-between min-h-[180px]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen size={15} className="text-blue-500" />
                    <span className="text-sm font-medium">Canvas</span>
                  </div>
                  <p className="text-[13px] text-[#A3A3A3] max-w-sm">
                    Assignments, grades, and announcements pulled from bCourses.
                    Scores update every 30 minutes without you touching anything.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <MiniTag>assignments</MiniTag>
                <MiniTag>grades</MiniTag>
                <MiniTag>announcements</MiniTag>
              </div>
            </div>

            {/* Gradescope — small card */}
            <div className="md:col-span-2 rounded-lg border border-[#1F1F1F] bg-[#111111] p-6 flex flex-col justify-between min-h-[180px]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardCheck size={15} className="text-emerald-500" />
                  <span className="text-sm font-medium">Gradescope</span>
                </div>
                <p className="text-[13px] text-[#A3A3A3]">
                  Submission status and detailed rubric scores from every assignment.
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <MiniTag>rubrics</MiniTag>
                <MiniTag>status</MiniTag>
              </div>
            </div>

            {/* Ed — small card */}
            <div className="md:col-span-2 rounded-lg border border-[#1F1F1F] bg-[#111111] p-6 flex flex-col justify-between min-h-[180px]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle size={15} className="text-purple-500" />
                  <span className="text-sm font-medium">Ed Discussion</span>
                </div>
                <p className="text-[13px] text-[#A3A3A3]">
                  Instructor posts and top questions surfaced so you don&apos;t
                  have to scroll through 200 threads.
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <MiniTag>posts</MiniTag>
                <MiniTag>questions</MiniTag>
              </div>
            </div>

            {/* Calendar — medium card */}
            <div className="md:col-span-2 rounded-lg border border-[#1F1F1F] bg-[#111111] p-6 flex flex-col justify-between min-h-[180px]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays size={15} className="text-amber-500" />
                  <span className="text-sm font-medium">Google Calendar</span>
                </div>
                <p className="text-[13px] text-[#A3A3A3]">
                  Class schedule with Berkeley Time already applied.
                  See what&apos;s next at a glance.
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <MiniTag>schedule</MiniTag>
                <MiniTag>berkeley time</MiniTag>
              </div>
            </div>

            {/* Course websites — medium card */}
            <div className="md:col-span-2 rounded-lg border border-[#1F1F1F] bg-[#111111] p-6 flex flex-col justify-between min-h-[180px]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Link2 size={15} className="text-rose-500" />
                  <span className="text-sm font-medium">Course Websites</span>
                </div>
                <p className="text-[13px] text-[#A3A3A3]">
                  Office hours, exam dates, and staff info scraped
                  automatically from course sites like cs162.org.
                </p>
              </div>
              <div className="mt-4 flex gap-2">
                <MiniTag>office hours</MiniTag>
                <MiniTag>exams</MiniTag>
              </div>
            </div>
          </div>

          {/* Bottom CTA — inline, not a separate section */}
          <div className="mt-16 flex flex-col sm:flex-row items-center justify-between gap-6 py-6 border-t border-[#1F1F1F]">
            <p className="text-sm text-[#A3A3A3]">
              Built by a Berkeley student, for Berkeley students.
            </p>
            <Link
              href="/onboarding"
              className="group inline-flex items-center gap-2 bg-[#F5F5F5] text-[#0A0A0A] px-6 py-3 text-sm font-semibold hover:bg-white transition-colors"
            >
              Get started
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer — minimal */}
      <footer className="border-t border-[#1F1F1F] py-6 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-[12px] text-[#525252]">
            &copy; {new Date().getFullYear()} Jarvis
          </span>
          <div className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="text-[12px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-[12px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Subcomponents ── */

function DashboardMiniCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded border border-[#1F1F1F] bg-[#0A0A0A] p-3">
      <span className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">
        {label}
      </span>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold" style={{ color: accent }}>
          {value}
        </span>
        <span className="text-[12px] text-[#525252]">{sub}</span>
      </div>
    </div>
  );
}

function GradeRow({
  course,
  name,
  score,
  color,
}: {
  course: string;
  name: string;
  score: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[12px] text-[#A3A3A3]">
          <span className="text-[#F5F5F5]">{course}</span> &middot; {name}
        </span>
      </div>
      <span className="text-[12px] font-mono text-[#A3A3A3]">{score}</span>
    </div>
  );
}

function EdRow({
  title,
  votes,
  answers,
}: {
  title: string;
  votes: number;
  answers: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[#A3A3A3] truncate max-w-[180px]">
        {title}
      </span>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] text-[#525252]">{votes} votes</span>
        <span className="text-[11px] text-[#525252]">{answers} ans</span>
      </div>
    </div>
  );
}

function MiniTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] text-[#525252] border border-[#1F1F1F] px-2 py-0.5 rounded">
      {children}
    </span>
  );
}
