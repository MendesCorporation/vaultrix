import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createUserCredentials } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'

export const runtime = 'nodejs'

const acceptSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const validation = acceptSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { token, password } = validation.data

  try {
    // 1. Buscar e validar convite
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true
          }
        }
      }
    })

    if (!invite) {
      return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
    }

    if (invite.usedAt) {
      return NextResponse.json({ error: 'Convite já foi utilizado' }, { status: 409 })
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })
    }

    if (!invite.user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    if (invite.user.isActive) {
      return NextResponse.json({ error: 'Usuário já está ativo' }, { status: 400 })
    }

    // 2. Criar credenciais
    const credentials = await createUserCredentials(password)

    // 3. Ativar usuário em transação atômica
    const result = await prisma.$transaction(async (tx) => {
      // Verificar novamente dentro da transação para evitar race conditions
      const currentUser = await tx.user.findUnique({
        where: { id: invite.userId },
        select: { id: true, isActive: true, email: true }
      })

      if (!currentUser) {
        throw new Error('Usuário não encontrado')
      }

      if (currentUser.isActive) {
        throw new Error('Usuário já está ativo')
      }

      // Atualizar usuário com nova senha e ativar
      const updatedUser = await tx.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash: credentials.passwordHash,
          encryptedDEK: credentials.encryptedDEK,
          salt: credentials.salt,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          isActive: true
        }
      })

      // Marcar convite como usado
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      })

      return updatedUser
    })

    // 4. Criar log de auditoria
    await createAuditLog({
      userId: invite.userId,
      action: 'PASSWORD_CHANGE',
      resourceType: 'USER',
      resourceId: invite.userId,
      resourceName: invite.user.name,
      metadata: { 
        invite: true, 
        activated: true,
        inviteToken: token.substring(0, 8) + '...' // Log parcial do token por segurança
      },
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return NextResponse.json({ 
      success: true,
      message: 'Conta ativada com sucesso'
    })

  } catch (error) {
    console.error('Error activating user account:', error)
    
    // Log mais específico do erro
    if (error instanceof Error) {
      console.error('Error details:', error.message)
      return NextResponse.json({ 
        error: 'Erro ao ativar conta', 
        details: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

