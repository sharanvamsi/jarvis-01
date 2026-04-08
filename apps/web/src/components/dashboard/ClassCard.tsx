import { ClassEvent } from '@/lib/types';
import { getCourseColor } from '@/lib/courseColors';

type ClassCardProps = {
  classEvent: ClassEvent;
};

export function ClassCard({ classEvent }: ClassCardProps) {
  const courseColor = getCourseColor(classEvent.courseCode);

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
        >
          {classEvent.courseCode}
        </span>
        <span className="bg-[#1F1F1F] text-[#A3A3A3] px-2 py-0.5 rounded text-xs">
          {classEvent.type}
        </span>
      </div>
      <div className="text-[#F5F5F5] text-sm font-medium mb-1">
        {classEvent.courseName}
      </div>
      <div className="text-[#F5F5F5] text-sm">
        {classEvent.berkeleyStartTime} &mdash; {classEvent.berkeleyEndTime}
      </div>
      <div className="text-[#525252] text-xs">
        Official: {classEvent.officialStartTime} &mdash; {classEvent.officialEndTime}
      </div>
      <div className="text-[#A3A3A3] text-xs mt-1">
        {classEvent.room}, {classEvent.building}
      </div>
    </div>
  );
}
