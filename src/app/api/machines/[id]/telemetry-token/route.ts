import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { checkPermission } from '@/lib/auth/permissions'
import { generateSecureToken, hashToken } from '@/lib/security'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Admins sempre podem, outros precisam de permissão
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  if (!isAdmin) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'UPDATE',
      resource: 'MACHINE',
      resourceId: id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const machine = await prisma.machine.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Gera um token único e armazena seu hash
  let token = ''
  let tokenHash = ''

  for (let i = 0; i < 5; i += 1) {
    token = generateSecureToken(32)
    tokenHash = hashToken(token)
    // Verifica se o hash já existe (muito improvável)
    const exists = await prisma.machine.findUnique({ where: { telemetryToken: tokenHash } })
    if (!exists) break
  }

  await prisma.machine.update({
    where: { id },
    data: {
      telemetryToken: tokenHash, // Armazena o hash, não o token original
      telemetryEnabled: true,
    },
  })

  // Retorna o token original para o usuário (única vez que será visível)
  return NextResponse.json({
    id: machine.id,
    telemetryToken: token, // Token original para o usuário copiar
    telemetryEnabled: true,
  })
}
