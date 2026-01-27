import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createUserCredentials } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { setConfigValue } from '@/lib/db/queries/system'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { normalizeEmail } from '@/lib/utils/email'

const setupSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  // Rate limit por IP
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rateLimit = checkRateLimit(`setup:${clientIP}`, RATE_LIMITS.setup)

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfter: rateLimit.retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter),
        },
      }
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verificar se é o admin padrão
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  })

  if (currentUser?.email !== 'admin@invetrix.local') {
    return NextResponse.json({ error: 'Setup já foi concluído' }, { status: 400 })
  }

  const body = await request.json()
  const validation = setupSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { name, email, password } = validation.data
  const normalizedEmail = normalizeEmail(email)

  // Verificar se email já está em uso por outro usuário
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  })

  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: 'Email já está em uso' }, { status: 409 })
  }

  const credentials = await createUserCredentials(password)

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      email: normalizedEmail,
      ...credentials,
      isActive: true,
    },
  })

  await setConfigValue('setup_completed', true)

  // Log de auditoria
  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'USER',
    resourceId: session.user.id,
    resourceName: name,
    metadata: { action: 'initial_setup_completed' },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
