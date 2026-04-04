import { Video, MapPin } from 'lucide-react';
import { getCourseColor } from '@/lib/courseColors';

type OfficeHourData = {
  id: string
  staffName: string
  staffRole: string
  dayOfWeek: number
  startTime: string
  endTime: string
  location: string | null
  zoomLink: string | null
  isRecurring: boolean
  course?: {
    courseCode: string | null
    courseName: string | null
  } | null
}

type OfficeHoursCardProps = {
  officeHour: OfficeHourData;
};

export function OfficeHoursCard({ officeHour }: OfficeHoursCardProps) {
  const courseColor = getCourseColor(officeHour.course?.courseCode);

  return (
    <div className="bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[#F5F5F5] text-sm font-medium mb-0.5">
            {officeHour.staffName}
          </div>
          <div className="text-[#A3A3A3] text-xs capitalize">{officeHour.staffRole}</div>
        </div>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
        >
          {officeHour.course?.courseCode ?? 'Course'}
        </span>
      </div>
      <div className="text-[#F5F5F5] text-sm mb-1">
        {officeHour.startTime} – {officeHour.endTime}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {officeHour.zoomLink ? (
          <a href={officeHour.zoomLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-[#3B82F6]" />
            <span className="text-[#3B82F6]">Zoom</span>
          </a>
        ) : officeHour.location ? (
          <>
            <MapPin className="w-3.5 h-3.5 text-[#A3A3A3]" />
            <span className="text-[#A3A3A3]">{officeHour.location}</span>
          </>
        ) : (
          <span className="text-[#525252]">Location TBD</span>
        )}
      </div>
    </div>
  );
}
