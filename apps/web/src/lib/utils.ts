export function relativeTime(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function daysUntil(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = then.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) return 'due now'
  if (diffHours < 24) return `due in ${diffHours}h`
  if (diffDays === 1) return 'due tomorrow'
  if (diffDays <= 7) return `due in ${diffDays}d`
  return `due ${new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

export function getAssignmentUrl(a: { htmlUrl?: string | null; specUrl?: string | null }): string | null {
  return a.htmlUrl || a.specUrl || null;
}

export function daysOverdue(date: Date | string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 1) return 'due today'
  if (diffDays === 1) return '1d overdue'
  return `${diffDays}d overdue`
}
