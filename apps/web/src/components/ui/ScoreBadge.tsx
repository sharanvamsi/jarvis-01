type ScoreBadgeProps = {
  score: number | null;
  maxScore: number | null;
  status: 'graded' | 'submitted' | 'missing' | 'late' | 'ungraded';
};

export function ScoreBadge({ score, maxScore, status }: ScoreBadgeProps) {
  if (status !== 'graded' || score === null) {
    return <span className="text-[#525252] text-sm">--/{maxScore}</span>;
  }

  return (
    <span className="text-[#F5F5F5] text-sm font-medium">
      {score}/{maxScore}
    </span>
  );
}
