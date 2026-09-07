import type { PrismaClient } from '../generated/prisma/index'

const seasons: Record<string, string> = { winter: 'WI', spring: 'SP', summer: 'SU', fall: 'FA' }
const order: Record<string, number> = { WI: 0, SP: 1, SU: 2, FA: 3 }

export function parseSemester(value: string | null | undefined): string | null {
  if (!value) return null
  const full = value.match(/\b(winter|spring|summer|fall)[\s_/-]*(20\d{2})\b/i)
  if (full) return seasons[full[1].toLowerCase()] + full[2].slice(-2)
  const reversed = value.match(/\b(20\d{2})[\s_/-]*(winter|spring|summer|fall)\b/i)
  if (reversed) return seasons[reversed[2].toLowerCase()] + reversed[1].slice(-2)
  const short = value.match(/(?:^|[^a-z0-9])(WI|SP|SU|FA)(20\d{2}|\d{2})(?=$|[^a-z0-9])/i)
  return short ? short[1].toUpperCase() + short[2].slice(-2) : null
}

export function semesterRank(value: string | null | undefined): number {
  const term = parseSemester(value)
  return term ? (2000 + Number(term.slice(2))) * 4 + order[term.slice(0, 2)] : -1
}

export function latestSemester(values: Array<string | null | undefined>, current?: string): string | null {
  return [...values, current].map(parseSemester).filter((v): v is string => v !== null)
    .sort((a, b) => semesterRank(b) - semesterRank(a))[0] ?? null
}

/** Only fetched terms advance a user's semester. Never reset another user's selections. */
export async function observeUserSemester(db: PrismaClient, userId: string, values: Array<string | null | undefined>, source: string): Promise<string> {
  return db.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const next = latestSemester(values, user.currentSemester)
    if (!next || semesterRank(next) <= semesterRank(user.currentSemester)) return user.currentSemester
    const changed = await tx.user.updateMany({
      where: { id: userId, currentSemester: user.currentSemester },
      data: { currentSemester: next },
    })
    if (!changed.count) return (await tx.user.findUniqueOrThrow({ where: { id: userId } })).currentSemester
    await tx.enrollment.updateMany({
      where: { userId, course: { OR: [{ term: { not: next } }, { term: null }] } },
      data: { userSelected: false },
    })
    await tx.syncMetadata.updateMany({
      where: { userId, source: { in: ['canvas', 'gradescope', 'ed', 'calendar', 'course_website', 'assignment_matcher'] } },
      data: { lastSynced: null, initialBackfillCompleted: false, needsUnification: true, contentHash: null },
    })
    await tx.syncLog.create({ data: {
      userId, service: 'semester_handoff', status: 'success', completedAt: new Date(),
      errorMessage: `${user.currentSemester} → ${next}; detected by ${source}. Select courses for the new semester.`,
    } })
    return next
  })
}
