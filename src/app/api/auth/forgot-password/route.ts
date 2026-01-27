import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { sendPasswordResetEmail } from '@/lib/email/mailer'
import { checkRateLimit, RATE_LIMITS, getClientIP } from '@/lib/security'
import { randomBytes } from 'crypto'
import { normalizeEmail } from '@/lib/utils/email'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request)

  // Rate limiting
  const rateLimitKey = `forgot_password:${clientIP}`
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
      { error: 'Invalid email' },
      { status: 400 }
    )
  }

  const { email } = result.data
  
  const normalizedEmail = normalizeEmail(email)
  // Always return success to prevent email enumeration
  // But only send email if user exists
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, name: true, email: true, isActive: true, locale: true },
  })

  if (user && user.isActive) {
    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({
    where: { email: normalizedEmail },
    })

    // Create new token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        token,
        email,
        expiresAt,
      },
    })

    // Build reset URL
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.AUTH_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      'http://localhost:3000'
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    // Send email
    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        name: user.name,
        resetUrl,
        locale: user.locale,
      })
    } catch (error) {
      console.error('Failed to send password reset email:', error)
      // Don't expose email sending errors to the user
    }
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ success: true })
}
