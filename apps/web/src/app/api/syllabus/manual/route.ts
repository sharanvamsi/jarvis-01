import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    courseId,
    isCurved,
    curveDescription,
    componentGroups,
    clobberPolicies,
  } = await req.json()

  if (!courseId || !componentGroups?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the user is enrolled in this course
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
  })
  if (!enrollment) {
    return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  try {
    await db.$transaction(async (tx) => {
      // Upsert syllabus — pre-confirmed since manually entered
      const syllabus = await tx.syllabus.upsert({
        where: { courseId },
        create: {
          courseId,
          source: 'manual',
          rawText: '',
          isCurved,
          curveDescription,
          confirmedAt: new Date(),
          confirmedBy: session.user.id,
        },
        update: {
          source: 'manual',
          isCurved,
          curveDescription,
          confirmedAt: new Date(),
          confirmedBy: session.user.id,
          extractedAt: new Date(),
        },
      })

      // Wipe and recreate
      await tx.componentGroup.deleteMany({ where: { syllabusId: syllabus.id } })
      await tx.clobberPolicy.deleteMany({ where: { syllabusId: syllabus.id } })

      // Fetch all assignments once (not per-group) to avoid N+1
      const allAssignments = await tx.assignment.findMany({
        where: { courseId },
      })

      // Track which assignments are already mapped to prevent cross-group duplicates
      const mappedAssignmentIds = new Set<string>()

      for (const group of componentGroups) {
        const created = await tx.componentGroup.create({
          data: {
            syllabusId: syllabus.id,
            name: group.name,
            weight: group.weight,
            dropLowest: group.dropLowest ?? 0,
            isExam: group.isExam ?? false,
            isBestOf: group.isBestOf ?? false,
          },
        })

        // Auto-match assignments by name pattern, preferring exact matches
        const groupNameLower = group.name.toLowerCase()
        const patterns = [
          groupNameLower,
          groupNameLower.replace(/\s+/g, ''),
          groupNameLower.split(' ')[0],
        ]

        const matched = allAssignments.filter((a) => {
          if (mappedAssignmentIds.has(a.id)) return false
          return patterns.some(p => a.name.toLowerCase().includes(p))
        })

        for (const a of matched) {
          mappedAssignmentIds.add(a.id)
        }

        if (matched.length > 0) {
          await tx.assignmentGroupMapping.createMany({
            data: matched.map((a) => ({
              assignmentId: a.id,
              componentGroupId: created.id,
            })),
            skipDuplicates: true,
          })
        }
      }

      for (const policy of (clobberPolicies ?? [])) {
        await tx.clobberPolicy.create({
          data: {
            syllabusId: syllabus.id,
            sourceName: policy.sourceName,
            targetName: policy.targetName,
            comparisonType: policy.comparisonType,
            conditionText: policy.conditionText,
          },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[manual syllabus] error:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
