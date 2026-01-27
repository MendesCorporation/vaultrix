import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import { createAuditLog } from '@/lib/db/queries/audit'
import { normalizeEmail } from '@/lib/utils/email'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimit = checkRateLimit(`mfa-check:${clientIP}`, RATE_LIMITS.login)

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
  const { password } = validation.data

  // Find user
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
    // Don't reveal if user exists
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_FAILED',
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { reason: 'invalid_password', context: 'mfa_check' },
    })
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Check system-wide MFA requirement
  const mfaConfig = await prisma.systemConfig.findUnique({
    where: { key: 'mfa_required' },
    select: { value: true },
  })
  const systemMfaRequired = mfaConfig?.value === true || mfaConfig?.value === 'true'

  // Determine MFA status
  const mfaRequired = systemMfaRequired || user.mfaEnabled
  const mfaSetUp = user.mfaEnabled
  const hasSecret = Boolean(user.mfaSecret)

  return NextResponse.json({
    mfaRequired,      // Whether MFA is required for this login
    mfaSetUp,         // Whether user has completed MFA setup
    needsSetup: mfaRequired && !mfaSetUp, // User needs to set up MFA first
    needsCode: mfaRequired && mfaSetUp,   // User needs to enter MFA code
  })
}
