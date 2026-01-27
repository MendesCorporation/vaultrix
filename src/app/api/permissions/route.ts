import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'

const permissionSchema = z.object({
  groupId: z.string().optional(),
  userId: z.string().optional(),
  resourceType: z.enum(['MACHINE', 'CREDENTIAL', 'PLATFORM', 'STACK', 'USER', 'GROUP']),
  resourceId: z.string().optional().nullable(),
  actions: z.array(z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE'])),
})

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

async function resolveResourceName(resourceType: string, resourceId?: string | null) {
  if (!resourceId) return null
  if (resourceType === 'MACHINE') {
    const machine = await prisma.machine.findUnique({
      where: { id: resourceId },
      select: { hostname: true },
    })
    return machine?.hostname || null
  }
  if (resourceType === 'CREDENTIAL') {
    const credential = await prisma.credential.findUnique({
      where: { id: resourceId },
      select: { name: true },
    })
    return credential?.name || null
  }
  if (resourceType === 'PLATFORM') {
    const platform = await prisma.platform.findUnique({
      where: { id: resourceId },
      select: { name: true },
    })
    return platform?.name || null
  }
  if (resourceType === 'STACK') {
    const stack = await prisma.stack.findUnique({
      where: { id: resourceId },
      select: { name: true },
    })
    return stack?.name || null
  }
  if (resourceType === 'USER') {
    const user = await prisma.user.findUnique({
      where: { id: resourceId },
      select: { name: true, email: true },
    })
    return user ? `${user.name} (${user.email})` : null
  }
  if (resourceType === 'GROUP') {
    const group = await prisma.group.findUnique({
      where: { id: resourceId },
      select: { name: true },
    })
    return group?.name || null
  }
  return null
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const resourceType = searchParams.get('resourceType') as any
  const resourceId = searchParams.get('resourceId')

  if (!resourceType || !resourceId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // Only admins or owners can view permissions
  if (!isAdmin(session.user.role)) {
    if (resourceType === 'MACHINE') {
      const machine = await prisma.machine.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      })
      if (!machine || machine.createdById !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (resourceType === 'CREDENTIAL') {
      const credential = await prisma.credential.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      })
      if (!credential || credential.createdById !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const permissions = await prisma.permission.findMany({
    where: { resourceType, resourceId },
    include: {
      group: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ data: permissions })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = permissionSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { groupId, userId, resourceType, resourceId, actions } = validation.data

  if (!groupId && !userId) {
    return NextResponse.json({ error: 'groupId or userId is required' }, { status: 400 })
  }

  // Only admins or owners can manage permissions
  if (!isAdmin(session.user.role)) {
    if (resourceType === 'MACHINE') {
      const machine = await prisma.machine.findUnique({
        where: { id: resourceId || '' },
        select: { createdById: true },
      })
      if (!machine || machine.createdById !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (resourceType === 'CREDENTIAL') {
      const credential = await prisma.credential.findUnique({
        where: { id: resourceId || '' },
        select: { createdById: true },
      })
      if (!credential || credential.createdById !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Replace existing permission for this target/resource
  const existingPermissions = await prisma.permission.findMany({
    where: {
      resourceType,
      resourceId: resourceId ?? null,
      ...(groupId ? { groupId } : {}),
      ...(userId ? { userId } : {}),
    },
    select: { actions: true },
  })

  await prisma.permission.deleteMany({
    where: {
      resourceType,
      resourceId: resourceId ?? null,
      ...(groupId ? { groupId } : {}),
      ...(userId ? { userId } : {}),
    },
  })

  let permission = null

  if (actions.length > 0) {
    permission = await prisma.permission.create({
      data: {
        groupId,
        userId,
        resourceType,
        resourceId: resourceId ?? null,
        actions,
      },
    })
  }

  const targetGroup = groupId
    ? await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } })
    : null
  const targetUser = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    : null

  const resourceName = await resolveResourceName(resourceType, resourceId ?? undefined)
  const previousActions = Array.from(new Set(existingPermissions.flatMap((p) => p.actions)))

  await createAuditLog({
    userId: session.user.id,
    action: actions.length > 0 ? 'PERMISSION_GRANTED' : 'PERMISSION_REVOKED',
    resourceType,
    resourceId: resourceId ?? undefined,
    resourceName: resourceName || undefined,
    metadata: {
      targetType: groupId ? 'group' : 'user',
      targetId: groupId || userId,
      targetName: targetGroup?.name || (targetUser ? `${targetUser.name} (${targetUser.email})` : undefined),
      actions,
      previousActions,
    },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  if (!permission) {
    return NextResponse.json({ success: true })
  }

  return NextResponse.json(permission, { status: 201 })
}
