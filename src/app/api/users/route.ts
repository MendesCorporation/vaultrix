import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createUserCredentials } from '@/lib/crypto'
import { sendInviteEmail } from '@/lib/email/mailer'
import { getSystemConfig } from '@/lib/db/queries/system'
import { randomBytes } from 'crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { normalizeLocale } from '@/lib/i18n/locales'
import { normalizeEmail } from '@/lib/utils/email'

const createUserSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
  groupIds: z.array(z.string()).optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can list users
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''

  const where: any = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: users })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can create users
  if (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = createUserSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  // Check if email already exists
  const normalizedEmail = normalizeEmail(validation.data.email)

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Email already in use' },
      { status: 409 }
    )
  }

  const smtpConfig = await getSystemConfig([
    'smtp_host',
    'smtp_port',
    'smtp_user',
    'smtp_pass',
    'smtp_from',
    'smtp_secure',
    'public_base_url',
  ])

  if (!smtpConfig.smtp_host || !smtpConfig.smtp_user || !smtpConfig.smtp_pass || !smtpConfig.smtp_from) {
    return NextResponse.json(
      { error: 'SMTP não configurado. Configure em Configurações.' },
      { status: 400 }
    )
  }

  const requestLocale = normalizeLocale(session.user.locale || request.headers.get('accept-language'))
  const tempPassword = randomBytes(24).toString('hex')
  const credentials = await createUserCredentials(tempPassword)

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: validation.data.name,
      role: validation.data.role,
      isActive: false,
      locale: requestLocale,
      ...credentials,
      groups: validation.data.groupIds?.length
        ? {
            createMany: {
              data: validation.data.groupIds.map((groupId) => ({ groupId })),
            },
          }
        : undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48)

  await prisma.invite.create({
    data: {
      token,
      email: user.email,
      name: user.name,
      role: user.role,
      userId: user.id,
      expiresAt,
    },
  })

  const publicBaseUrl = smtpConfig.public_base_url as string | undefined
  const origin =
    publicBaseUrl ||
    request.headers.get('origin') ||
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  const inviteUrl = `${origin.replace(/\/$/, '')}/invite/${token}`

  try {
    await sendInviteEmail({
      to: user.email,
      name: user.name,
      inviteUrl,
      locale: requestLocale,
    })
  } catch (error) {
    await prisma.invite.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
    const message = error instanceof Error ? error.message : 'Falha ao enviar convite'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'USER',
    resourceId: user.id,
    resourceName: user.name,
    newValue: { email: user.email, role: user.role },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ ...user, inviteSent: true }, { status: 201 })
}
