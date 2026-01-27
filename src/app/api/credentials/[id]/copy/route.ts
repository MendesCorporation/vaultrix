import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'
import { getClientIP } from '@/lib/security'

const copySchema = z.object({
  field: z.enum(['password', 'username', 'token', 'clientId', 'clientSecret']),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const validation = copySchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const credential = await prisma.credential.findUnique({
    where: { id },
    include: {
      platform: { select: { name: true } },
    },
  })

  if (!credential) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = credential.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'READ',
      resource: 'CREDENTIAL',
      resourceId: id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'SECRET_COPIED',
    resourceType: 'CREDENTIAL',
    resourceId: credential.id,
    resourceName: credential.name,
    metadata: {
      field: validation.data.field,
      platformName: credential.platform?.name,
    },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
