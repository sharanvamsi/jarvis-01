"use client";

const LETTER_ORDER = [
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F", "P", "NP", "S", "U"
];

const PNP_GRADES = new Set(["P", "NP", "S", "U"]);

function barColor(letter: string): string {
  if (letter.startsWith("A") || letter === "P" || letter === "S") return "#3B82F6";
  if (letter.startsWith("B")) return "#3B82F6";
  if (letter.startsWith("C")) return "#3B82F6";
  if (letter.startsWith("D") || letter === "F" || letter === "NP" || letter === "U") return "#3B82F6";
  return "#3B82F6";
}

interface Item { letter: string; percentage: number; count: number }
interface Props {
  distribution: Item[];
  average: number | null;
  showPnp?: boolean;
  onTogglePnp?: (val: boolean) => void;
  markerLetter?: string | null;
}

export default function GradeDistributionBar({
  distribution,
  average,
  showPnp = false,
  onTogglePnp,
  markerLetter,
}: Props) {
  // Filter out zero-count buckets
  const nonZero = distribution.filter(d => d.count > 0);

  // Separate letter grades from P/NP grades
  const letterGrades = nonZero.filter(d => !PNP_GRADES.has(d.letter));
  const pnpGrades = nonZero.filter(d => PNP_GRADES.has(d.letter));

  // Determine which grades to show
  const visibleGrades = showPnp ? nonZero : letterGrades;

  // Recalculate percentages against the visible population's total count
  const totalCount = visibleGrades.reduce((sum, d) => sum + d.count, 0);

  const withRecalcPct = visibleGrades.map(d => ({
    ...d,
    displayPct: totalCount > 0 ? d.count / totalCount : 0,
  }));

  // Sort by canonical order
  const sorted = [...withRecalcPct].sort((a, b) => {
    const ai = LETTER_ORDER.indexOf(a.letter);
    const bi = LETTER_ORDER.indexOf(b.letter);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const maxPct = Math.max(...sorted.map(d => d.displayPct), 0.01);

  // P/NP summary for stat pill
  const totalPnpCount = pnpGrades.reduce((sum, d) => sum + d.count, 0);
  const totalAll = nonZero.reduce((sum, d) => sum + d.count, 0);
  const pnpPct = totalAll > 0 ? (totalPnpCount / totalAll) * 100 : 0;

  return (
    <div className="w-full">
      {/* Bars */}
      <div className="flex items-end gap-[2px] h-24">
        {sorted.map((item) => {
          const heightPct = (item.displayPct / maxPct) * 100;
          const isMarked = markerLetter != null && item.letter === markerLetter;
          const hasMark = markerLetter != null && sorted.some(s => s.letter === markerLetter);
          return (
            <div
              key={item.letter}
              title={`${item.letter}: ${item.count} students (${(item.displayPct * 100).toFixed(1)}%)`}
              className="group relative flex-1 min-w-0 flex flex-col justify-end cursor-default"
              style={{ height: "100%" }}
            >
              {/* Percentage label above bar */}
              <div
                className="text-center text-[9px] mb-0.5 leading-none"
                style={{ color: isMarked ? '#F5F5F5' : '#A3A3A3' }}
              >
                {(item.displayPct * 100).toFixed(1)}%
              </div>
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${Math.max(heightPct, 3)}%`,
                  backgroundColor: isMarked ? '#10B981' : barColor(item.letter),
                  opacity: isMarked ? 1 : hasMark ? 0.4 : 0.85,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Letter labels */}
      <div className="flex gap-[2px] mt-1">
        {sorted.map((item) => {
          const isMarked = markerLetter != null && item.letter === markerLetter;
          return (
            <div
              key={item.letter}
              className="flex-1 min-w-0 text-center truncate"
              style={{
                fontSize: isMarked ? '10px' : '9px',
                fontWeight: isMarked ? 600 : 400,
                color: isMarked ? '#10B981' : '#525252',
              }}
            >
              {isMarked ? `▲ ${item.letter}` : item.letter}
            </div>
          );
        })}
      </div>
    </div>
  );
}
