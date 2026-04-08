import { Announcement } from '@/lib/types';
import { getCourseColor } from '@/lib/courseColors';
import { SourceBadge } from '@/components/ui/SourceBadge';

type AnnouncementCardProps = {
  announcement: Announcement;
  url?: string | null;
};

export function AnnouncementCard({ announcement, url }: AnnouncementCardProps) {
  const courseColor = getCourseColor(announcement.courseCode);

  const card = (
    <div className={`bg-[#111111] border border-[#1F1F1F] rounded p-4 hover:bg-[#161616] transition-colors${url ? ' cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
            >
              {announcement.courseCode}
            </span>
            <SourceBadge source={announcement.source === 'Canvas' ? 'canvas' : announcement.source === 'Ed' ? 'ed' : 'canvas'} />
          </div>
          <div className="text-[#F5F5F5] text-sm mb-1">{announcement.title}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#525252]">via {announcement.source}</span>
            <span className="text-[#525252]">&bull;</span>
            <span className="text-[#A3A3A3]">{announcement.timeAgo}</span>
          </div>
        </div>
        {announcement.unread && (
          <div className="w-2 h-2 rounded-full bg-[#3B82F6] flex-shrink-0 mt-1" />
        )}
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
