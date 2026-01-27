import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'

const membersSchema = z.object({
  userIds: z.array(z.string()).default([]),
})

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = membersSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const groupId = params.id
  const userIds = validation.data.userIds

  const group = await prisma.group.findUnique({
    where: { id: groupId },
  })

  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const existing = await prisma.userGroup.findMany({
    where: { groupId },
    select: { userId: true },
  })

  const existingIds = new Set(existing.map((ug) => ug.userId))
  const nextIds = new Set(userIds)
  const toRemove = Array.from(existingIds).filter((id) => !nextIds.has(id))
  const toCreate = userIds.filter((id) => !existingIds.has(id))

  await prisma.userGroup.deleteMany({
    where: {
      groupId,
      ...(userIds.length ? { userId: { notIn: userIds } } : {}),
    },
  })

  if (toCreate.length > 0) {
    await prisma.userGroup.createMany({
      data: toCreate.map((userId) => ({ userId, groupId })),
      skipDuplicates: true,
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'GROUP',
    resourceId: group.id,
    resourceName: group.name,
    metadata: {
      addedUserIds: toCreate,
      removedUserIds: toRemove,
    },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
