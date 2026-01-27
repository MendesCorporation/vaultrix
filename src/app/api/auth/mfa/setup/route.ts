import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { verifyPassword } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import {
  generateMfaSecret,
  encryptMfaSecret,
  getOtpAuthUrl,
  generateQrCodeDataUrl,
} from '@/lib/security/mfa'
import { normalizeEmail } from '@/lib/utils/email'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const MFA_ISSUER = 'Vaultrix'

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)
  const rateLimit = checkRateLimit(`mfa-setup:${clientIP}`, RATE_LIMITS.login)

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

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
      mfaEnabled: true,
    },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (user.mfaEnabled) {
    return NextResponse.json({ error: 'MFA already enabled' }, { status: 400 })
  }

  const secret = generateMfaSecret()
  const encryptedSecret = encryptMfaSecret(secret)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaSecret: encryptedSecret,
      mfaEnabled: false,
    },
  })

  const otpauthUrl = getOtpAuthUrl({
    accountName: user.email,
    issuer: MFA_ISSUER,
    secret,
  })
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl)

  return NextResponse.json({
    issuer: MFA_ISSUER,
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  })
}
