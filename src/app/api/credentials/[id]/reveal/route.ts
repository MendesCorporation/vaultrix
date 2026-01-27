import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'
import { getClientIP, checkRateLimit, rateLimitExceededResponse, RATE_LIMITS } from '@/lib/security'
import { decryptSystemData } from '@/lib/crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clientIP = getClientIP(request)
  const { id } = await params

  // Rate limiting por usuário
  const rateLimitKey = `reveal:${session.user.id}`
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.reveal)

  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit)
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

  const body = await request.json().catch(() => ({}))
  const requestedField = typeof body?.field === 'string' ? body.field : undefined
  const allowedFields = new Set(['password', 'token', 'clientId', 'clientSecret'])

  if (requestedField && !allowedFields.has(requestedField)) {
    return NextResponse.json({ error: 'Campo inválido' }, { status: 400 })
  }
  const resolvedField = requestedField || (
    credential.type === 'API_TOKEN'
      ? 'token'
      : credential.type === 'CLIENT_SECRET'
        ? 'clientSecret'
        : 'password'
  )

  const fieldMap: Record<string, string | null | undefined> = {
    password: credential.encryptedPass,
    token: credential.encryptedToken,
    clientId: credential.encryptedClientId,
    clientSecret: credential.encryptedClientSecret,
  }

  const encryptedValue = fieldMap[resolvedField]
  if (!encryptedValue) {
    return NextResponse.json({ error: 'Segredo não encontrado' }, { status: 404 })
  }

  // Log secret view in audit
  await createAuditLog({
    userId: session.user.id,
    action: 'SECRET_VIEWED',
    resourceType: 'CREDENTIAL',
    resourceId: credential.id,
    resourceName: credential.name,
    metadata: {
      platformName: credential.platform?.name,
      username: credential.username,
      field: resolvedField,
    },
    ipAddress: clientIP,
    userAgent: request.headers.get('user-agent') || undefined,
  })

  // Decrypt the requested secret using the system key
  const decryptedSecret = decryptSystemData(encryptedValue)

  return NextResponse.json({
    password: decryptedSecret,
    value: decryptedSecret,
    expiresIn: 30, // Auto-clear hint for frontend
  })
}
