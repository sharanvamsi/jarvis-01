import { Assignment } from '@/lib/types';
import { getCourseColor } from '@/lib/courseColors';
import { ScoreBadge } from '@/components/ui/ScoreBadge';

type AssignmentCardProps = {
  assignment: Assignment;
  url?: string | null;
};

export function AssignmentCard({ assignment, url }: AssignmentCardProps) {
  const courseColor = getCourseColor(assignment.courseCode);

  const getDueDateColor = () => {
    if (assignment.overdue) return 'text-[#EF4444]';
    if (assignment.daysUntil <= 2) return 'text-[#F59E0B]';
    return 'text-[#A3A3A3]';
  };

  const getDueDateText = () => {
    if (assignment.overdue) {
      return `Overdue by ${Math.abs(assignment.daysUntil)} day${Math.abs(assignment.daysUntil) !== 1 ? 's' : ''}`;
    }
    return `Due in ${assignment.daysUntil} day${assignment.daysUntil !== 1 ? 's' : ''}`;
  };

  const card = (
    <div
      className={`
        bg-[#111111] border border-[#1F1F1F] rounded p-4 hover:bg-[#161616] transition-colors
        ${assignment.overdue ? 'border-l-2 border-l-[#EF4444]' : ''}
        ${url ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
            >
              {assignment.courseCode}
            </span>
            <span className="px-2 py-0.5 rounded text-xs bg-[#1F1F1F] text-[#A3A3A3]">
              {assignment.type}
            </span>
          </div>
          <div className="text-[#F5F5F5] text-sm mb-1">{assignment.title}</div>
          <div className={`text-xs ${getDueDateColor()}`}>
            {getDueDateText()}
          </div>
        </div>
        <div className="flex-shrink-0">
          <ScoreBadge score={assignment.score} maxScore={assignment.maxScore} status={assignment.status} />
        </div>
      </div>
    </div>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    );
  }

  return card;
}
