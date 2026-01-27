import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'

const groupSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
})

function isAdmin(role?: string) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export async function GET(
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

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: {
      users: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        },
      },
    },
  })

  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(group)
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
  const validation = groupSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existing = await prisma.group.findUnique({
    where: { id: params.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const group = await prisma.group.update({
    where: { id: params.id },
    data: validation.data,
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'GROUP',
    resourceId: group.id,
    resourceName: group.name,
    oldValue: { name: existing.name, description: existing.description },
    newValue: { name: group.name, description: group.description },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(group)
}

export async function DELETE(
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

  const group = await prisma.group.findUnique({
    where: { id: params.id },
  })

  if (!group) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.group.delete({
    where: { id: params.id },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'GROUP',
    resourceId: group.id,
    resourceName: group.name,
    oldValue: { name: group.name, description: group.description },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
