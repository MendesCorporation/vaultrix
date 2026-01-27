import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import { decryptMfaSecret, normalizeMfaToken, verifyMfaToken } from '@/lib/security/mfa'
import { createAuditLog } from '@/lib/db/queries/audit'
import { normalizeEmail } from '@/lib/utils/email'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  otp: z.string().min(6).max(6),
})

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimit = checkRateLimit(`mfa-verify:${clientIP}`, RATE_LIMITS.login)

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

  const normalizedEmail = normalizeEmail(validation.data.email)
  const { password, otp } = validation.data

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
      mfaEnabled: true,
      mfaSecret: true,
    },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!user.mfaSecret) {
    return NextResponse.json({ error: 'MFA not configured' }, { status: 400 })
  }

  const secret = decryptMfaSecret(user.mfaSecret)
  const normalizedOtp = normalizeMfaToken(otp)

  if (!verifyMfaToken(normalizedOtp, secret)) {
    await createAuditLog({
      userId: user.id,
      action: 'MFA_INVALID',
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
    })
    return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
  }

  // Ativar MFA se ainda não estiver ativo
  if (!user.mfaEnabled) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true },
    })

    await createAuditLog({
      userId: user.id,
      action: 'MFA_ENABLED',
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
    })
  }

  return NextResponse.json({ success: true })
}
