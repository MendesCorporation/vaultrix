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

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''

  if (!isAdmin(session.user.role)) {
    const groups = await prisma.group.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ data: groups })
  }

  const where: any = {}

  if (search) {
    where.name = { contains: search, mode: 'insensitive' }
  }

  const groups = await prisma.group.findMany({
    where,
    include: {
      _count: { select: { users: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({ data: groups })
}

export async function POST(request: NextRequest) {
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
    where: { name: validation.data.name },
  })

  if (existing) {
    return NextResponse.json({ error: 'Group already exists' }, { status: 409 })
  }

  const group = await prisma.group.create({
    data: validation.data,
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'GROUP',
    resourceId: group.id,
    resourceName: group.name,
    newValue: { name: group.name, description: group.description },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(group, { status: 201 })
}
