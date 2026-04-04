import { SourceBadge } from '@/components/ui/SourceBadge'
import { relativeTime } from '@/lib/utils'
import { getCourseColor } from '@/lib/courseColors'

type UnifiedAnnouncementCardProps = {
  title: string
  body: string | null
  postedAt: Date
  source: 'canvas' | 'ed'
  courseCode: string
  url: string | null
}

export function UnifiedAnnouncementCard({
  title,
  body,
  postedAt,
  source,
  courseCode,
  url,
}: UnifiedAnnouncementCardProps) {
  const courseColor = getCourseColor(courseCode)
  const truncatedBody =
    body && body.length > 120 ? body.slice(0, 120) + '...' : body

  const card = (
    <div
      className={`bg-[#111111] border border-[#1F1F1F] rounded-md p-4 hover:bg-[#161616] transition-colors${url ? ' cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{ backgroundColor: `${courseColor}20`, color: courseColor }}
        >
          {courseCode}
        </span>
        <SourceBadge source={source} />
      </div>
      <div className="text-[#F5F5F5] text-sm font-medium mb-1">{title}</div>
      {truncatedBody && (
        <div className="text-[#A3A3A3] text-xs mb-2 line-clamp-2">
          {truncatedBody}
        </div>
      )}
      <div className="text-[#525252] text-xs">{relativeTime(postedAt)}</div>
    </div>
  )

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {card}
      </a>
    )
  }

  return card
}
