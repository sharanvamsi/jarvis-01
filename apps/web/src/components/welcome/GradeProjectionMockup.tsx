"use client";

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

const scenarios = [
  { grade: "B", finalScore: 78 },
  { grade: "B+", finalScore: 85 },
  { grade: "A-", finalScore: 92 },
] as const;

// Fake BerkeleyTime distribution segments (percentages that add to 100)
const distribution = [
  { label: "A", pct: 28, color: "#3B82F6" },
  { label: "B", pct: 34, color: "#10B981" },
  { label: "C", pct: 22, color: "#F59E0B" },
  { label: "D", pct: 10, color: "#EF4444" },
  { label: "F", pct: 6, color: "#525252" },
];

// Where the marker sits for each scenario (cumulative %)
const markerPositions = [52, 38, 18] as const;

export default function GradeProjectionMockup() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((prev) => (prev + 1) % scenarios.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const s = scenarios[idx];

  return (
    <div className="rounded-lg border border-[#1F1F1F] bg-[#111111] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-[#F5F5F5] text-sm font-medium">CS 162</span>
        </div>
      </div>

      {/* Projected grade */}
      <div className="px-5 pb-4">
        <span className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">
          Projected grade
        </span>
        <div className="mt-1 h-[52px] relative">
          <AnimatePresence mode="wait">
            <motion.span
              key={s.grade}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-4xl font-bold text-[#F5F5F5] absolute left-0 top-0"
            >
              {s.grade}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Assignment table */}
      <div className="mx-5 rounded border border-[#1F1F1F] bg-[#0A0A0A] overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] text-[11px] text-[#525252] uppercase tracking-wider font-medium px-3 py-2 border-b border-[#1F1F1F]">
          <span>Assignment</span>
          <span>Score</span>
        </div>
        <div className="divide-y divide-[#1F1F1F]">
          <AssignmentRow name="HW 5" score="87/100" graded />
          <AssignmentRow name="Midterm 1" score="72/85" graded />
          <FinalRow score={s.finalScore} />
        </div>
      </div>

      {/* Weight breakdown */}
      <p className="px-5 pt-3 text-[11px] text-[#525252]">
        Homework 30% &middot; Midterm 25% &middot; Final 45%
      </p>

      {/* Distribution bar */}
      <div className="px-5 pt-4 pb-5">
        <span className="text-[11px] text-[#525252] uppercase tracking-wider font-medium">
          BerkeleyTime distribution
        </span>
        <div className="mt-2 relative">
          <div className="flex h-3 rounded-sm overflow-hidden">
            {distribution.map((d) => (
              <div
                key={d.label}
                style={{ width: `${d.pct}%`, backgroundColor: d.color }}
                className="relative"
              >
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-medium text-white/70">
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          {/* Marker triangle */}
          <motion.div
            className="absolute -top-1.5"
            animate={{ left: `${markerPositions[idx]}%` }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-[#F5F5F5] -translate-x-1/2" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ── Subcomponents ── */

function AssignmentRow({
  name,
  score,
  graded,
}: {
  name: string;
  score: string;
  graded?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2">
      <span className="text-[12px] text-[#A3A3A3]">{name}</span>
      <span
        className={`text-[12px] font-mono ${graded ? "text-emerald-500" : "text-[#A3A3A3]"}`}
      >
        {score}
      </span>
    </div>
  );
}

function FinalRow({ score }: { score: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center px-3 py-2 bg-blue-500/5">
      <span className="text-[12px] text-[#A3A3A3]">Final</span>
      <span className="text-[12px] font-mono text-blue-400 relative">
        <AnimatePresence mode="wait">
          <motion.span
            key={score}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {score}/100
          </motion.span>
        </AnimatePresence>
        <span className="inline-block w-[2px] h-3.5 bg-blue-400 ml-0.5 animate-pulse align-middle" />
      </span>
    </div>
  );
}
