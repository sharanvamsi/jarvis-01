import { getCourseColor } from '@/lib/courseColors';

type ExamData = {
  id: string
  name: string
  date: Date | null
  location: string | null
  durationMin: number | null
  pastExamUrl: string | null
  solutionUrl: string | null
  course?: {
    courseCode: string | null
    courseName: string | null
  } | null
}

type ExamCardProps = {
  exam: ExamData;
};

export function ExamCard({ exam }: ExamCardProps) {
  const courseColor = getCourseColor(exam.course?.courseCode);
  const daysUntil = exam.date
    ? Math.ceil((new Date(exam.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const getBorderColor = () => {
    if (daysUntil === null) return 'border-[#1F1F1F]';
    if (daysUntil <= 2) return 'border-[#EF4444]';
    if (daysUntil <= 7) return 'border-[#F59E0B]';
    return 'border-[#1F1F1F]';
  };

  return (
    <div className={`bg-[#111111] border ${getBorderColor()} rounded-md p-4 hover:bg-[#161616] transition-colors`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[#F5F5F5] text-sm font-medium mb-2">
            {exam.name}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
            >
              {exam.course?.courseCode ?? 'Course'}
            </span>
          </div>
          {exam.date && (
            <div className="text-[#A3A3A3] text-xs mb-1">
              {new Date(exam.date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          )}
          {exam.location && (
            <div className="text-[#A3A3A3] text-xs">{exam.location}</div>
          )}
          {exam.pastExamUrl && (
            <a
              href={exam.pastExamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3B82F6] text-xs hover:text-[#60A5FA] mt-1 inline-block"
            >
              Past Exams
            </a>
          )}
        </div>
        {daysUntil !== null && (
          <div className="text-right">
            <div className="text-[#F5F5F5] text-3xl font-medium">{daysUntil}</div>
            <div className="text-[#A3A3A3] text-xs">days away</div>
          </div>
        )}
      </div>
    </div>
  );
}
