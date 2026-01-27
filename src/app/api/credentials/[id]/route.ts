import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'
import { encryptSystemData } from '@/lib/crypto'

const updateCredentialSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['LOGIN_PASSWORD', 'API_TOKEN', 'CLIENT_SECRET']).optional(),
  username: z.string().max(255).optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  url: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
  platformId: z.string().optional().nullable(),
  machineId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const credential = await prisma.credential.findUnique({
    where: { id: params.id },
    include: {
      platform: { select: { id: true, name: true, logoUrl: true } },
      machine: { select: { id: true, hostname: true, ip: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  })

  if (!credential) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = credential.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'READ',
      resource: 'CREDENTIAL',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Don't return the encrypted password in GET
  const {
    encryptedPass,
    encryptedToken,
    encryptedClientId,
    encryptedClientSecret,
    ...safeCredential
  } = credential

  return NextResponse.json(safeCredential)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = updateCredentialSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existingCredential = await prisma.credential.findUnique({
    where: { id: params.id },
  })

  if (!existingCredential) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = existingCredential.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'UPDATE',
      resource: 'CREDENTIAL',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const {
    password,
    token,
    clientId,
    clientSecret,
    expiresAt,
    type,
    username,
    platformId,
    machineId,
    ...credentialData
  } = validation.data

  const nextType = type ?? existingCredential.type
  const nextPlatformId = platformId !== undefined ? platformId : existingCredential.platformId
  const typeChanged = type !== undefined && type !== existingCredential.type
  const shouldValidatePlatform = typeChanged || platformId !== undefined

  if (shouldValidatePlatform && nextPlatformId) {
    const platform = await prisma.platform.findUnique({
      where: { id: nextPlatformId },
      select: { supportsLogin: true, supportsApiToken: true, supportsClientSecret: true },
    })

    if (!platform) {
      return NextResponse.json({ error: 'Plataforma não encontrada' }, { status: 404 })
    }

    const supported =
      (nextType === 'LOGIN_PASSWORD' && platform.supportsLogin) ||
      (nextType === 'API_TOKEN' && platform.supportsApiToken) ||
      (nextType === 'CLIENT_SECRET' && platform.supportsClientSecret)

    if (!supported) {
      return NextResponse.json(
        { error: 'Tipo de credencial não suportado pela plataforma' },
        { status: 400 }
      )
    }
  }

  const normalizeSecret = (value?: string) => {
    if (value === undefined) return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  const normalizedPassword = normalizeSecret(password)
  const normalizedToken = normalizeSecret(token)
  const normalizedClientId = normalizeSecret(clientId)
  const normalizedClientSecret = normalizeSecret(clientSecret)
  if (typeChanged) {
    if (nextType === 'LOGIN_PASSWORD' && !normalizedPassword) {
      return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
    }
    if (nextType === 'API_TOKEN' && !normalizedToken) {
      return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })
    }
    if (nextType === 'CLIENT_SECRET' && (!normalizedClientId || !normalizedClientSecret)) {
      return NextResponse.json(
        { error: 'Client ID e Client Secret são obrigatórios' },
        { status: 400 }
      )
    }
  }

  const updateData: Record<string, any> = {
    ...credentialData,
    ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
  }

  if (type !== undefined) updateData.type = type
  if (platformId !== undefined) updateData.platformId = platformId
  if (machineId !== undefined) updateData.machineId = machineId

  if (nextType === 'LOGIN_PASSWORD') {
    if (username !== undefined) {
      updateData.username = username.trim() ? username.trim() : null
    }
  } else if (typeChanged) {
    updateData.username = null
  }

  if (typeChanged) {
    updateData.encryptedPass = null
    updateData.encryptedToken = null
    updateData.encryptedClientId = null
    updateData.encryptedClientSecret = null
  }

  if (nextType === 'LOGIN_PASSWORD' && normalizedPassword !== undefined) {
    updateData.encryptedPass = encryptSystemData(normalizedPassword)
  }
  if (nextType === 'API_TOKEN' && normalizedToken !== undefined) {
    updateData.encryptedToken = encryptSystemData(normalizedToken)
  }
  if (nextType === 'CLIENT_SECRET') {
    if (normalizedClientId !== undefined) {
      updateData.encryptedClientId = encryptSystemData(normalizedClientId)
    }
    if (normalizedClientSecret !== undefined) {
      updateData.encryptedClientSecret = encryptSystemData(normalizedClientSecret)
    }
  }

  const credential = await prisma.credential.update({
    where: { id: params.id },
    data: updateData,
    include: {
      platform: { select: { id: true, name: true } },
      machine: { select: { id: true, hostname: true } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'CREDENTIAL',
    resourceId: credential.id,
    resourceName: credential.name,
    oldValue: { name: existingCredential.name, username: existingCredential.username },
    newValue: { name: credential.name, username: credential.username },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(credential)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const credential = await prisma.credential.findUnique({
    where: { id: params.id },
  })

  if (!credential) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const isOwner = credential.createdById === session.user.id

  if (!isAdmin && !isOwner) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'DELETE',
      resource: 'CREDENTIAL',
      resourceId: params.id,
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Soft delete
  await prisma.credential.update({
    where: { id: params.id },
    data: { isActive: false },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'CREDENTIAL',
    resourceId: credential.id,
    resourceName: credential.name,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
