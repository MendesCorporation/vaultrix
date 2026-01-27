import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getSystemConfig } from '@/lib/db/queries/system'

const schema = z.object({
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verificar se MFA é obrigatório no sistema
  const config = await getSystemConfig(['mfa_required'])
  const mfaRequired = config.mfa_required === true || config.mfa_required === 'true'
  
  if (mfaRequired) {
    return NextResponse.json({ error: 'MFA is required by system policy' }, { status: 400 })
  }

  const clientIP = getClientIP(request)
  const rateLimit = checkRateLimit(`mfa-disable:${clientIP}`, RATE_LIMITS.login)

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const validation = schema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { password } = validation.data

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      passwordHash: true,
      mfaEnabled: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  if (!user.mfaEnabled) {
    return NextResponse.json({ error: 'MFA is not enabled' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
    },
  })

  await createAuditLog({
    userId: user.id,
    action: 'MFA_DISABLED',
    ipAddress: clientIP,
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}