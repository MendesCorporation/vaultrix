import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'
import { getClientIP } from '@/lib/security'

const secretSchema = z.object({
  action: z.enum(['SECRET_VIEWED', 'SECRET_COPIED']),
  field: z.enum(['username', 'password', 'sshKey']),
  method: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const validation = secretSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const machine = await prisma.machine.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      hostname: true,
      createdById: true,
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = machine.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'READ',
      resource: 'MACHINE',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: validation.data.action,
    resourceType: 'MACHINE',
    resourceId: machine.id,
    resourceName: machine.hostname,
    metadata: {
      field: validation.data.field,
      method: validation.data.method,
    },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
