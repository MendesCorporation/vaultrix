import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createUserCredentials } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import { createAuditLog } from '@/lib/db/queries/audit'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)

  // Rate limiting
  const rateLimitKey = `reset_password:${clientIP}`
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.login)

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.errors[0]?.message || 'Invalid input' },
      { status: 400 }
    )
  }

  const { token, password } = result.data

  // Find the token
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  })

  if (!resetToken) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 400 }
    )
  }

  // Check if token is expired
  if (resetToken.expiresAt < new Date()) {
    await prisma.passwordResetToken.delete({
      where: { id: resetToken.id },
    })
    return NextResponse.json(
      { error: 'Token has expired' },
      { status: 400 }
    )
  }

  // Check if token was already used
  if (resetToken.usedAt) {
    return NextResponse.json(
      { error: 'Token has already been used' },
      { status: 400 }
    )
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email: resetToken.email },
  })

  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: 'User not found or inactive' },
      { status: 400 }
    )
  }

  // Create new credentials with new DEK
  // Note: This means any data encrypted with the old DEK will be inaccessible
  // This is the expected behavior for a password reset without the old password
  const credentials = await createUserCredentials(password)

  // Update user and mark token as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: credentials.passwordHash,
        salt: credentials.salt,
        encryptedDEK: credentials.encryptedDEK,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ])

  // Audit log
  await createAuditLog({
    userId: user.id,
    action: 'PASSWORD_CHANGE',
    ipAddress: clientIP,
    userAgent: request.headers.get('user-agent') || undefined,
    metadata: { method: 'reset' },
  })

  // Clean up expired tokens
  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  })

  return NextResponse.json({ success: true })
}

// GET to validate token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json(
      { valid: false, error: 'Token required' },
      { status: 400 }
    )
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  })

  if (!resetToken) {
    return NextResponse.json({ valid: false, error: 'Invalid token' })
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, error: 'Token expired' })
  }

  if (resetToken.usedAt) {
    return NextResponse.json({ valid: false, error: 'Token already used' })
  }

  return NextResponse.json({ valid: true })
}
