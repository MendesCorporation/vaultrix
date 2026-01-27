import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission, getResourceAccess } from '@/lib/auth/permissions'
import { encryptSystemData } from '@/lib/crypto'
import { getClientIP } from '@/lib/security'

const createCredentialSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['LOGIN_PASSWORD', 'API_TOKEN', 'CLIENT_SECRET']).default('LOGIN_PASSWORD'),
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
  expiresAt: z.string().datetime().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const search = searchParams.get('search') || ''
  const platformId = searchParams.get('platformId')
  const machineId = searchParams.get('machineId')

  const where: any = { isActive: true }

  const access = await getResourceAccess({
    userId: session.user.id,
    resourceType: 'CREDENTIAL',
    action: 'READ',
  })

  if (!access.isAdmin && !access.hasGlobalAccess) {
    where.OR = [{ createdById: session.user.id }]
    if (access.resourceIds.length > 0) {
      where.OR.push({ id: { in: access.resourceIds } })
    }
  }

  if (search) {
    const searchFilter = [
      { name: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
      { url: { contains: search, mode: 'insensitive' } },
    ]

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }]
      delete where.OR
    } else {
      where.OR = searchFilter
    }
  }

  if (platformId) where.platformId = platformId
  if (machineId) where.machineId = machineId

  const [credentials, total] = await Promise.all([
    prisma.credential.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        username: true,
        url: true,
        tags: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        platform: { select: { id: true, name: true, logoUrl: true } },
        machine: { select: { id: true, hostname: true, ip: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.credential.count({ where }),
  ])

  return NextResponse.json({
    data: credentials,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verificar permissão - admins sempre podem, usuários precisam de permissão explícita
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  if (!isAdmin) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'CREATE',
      resource: 'CREDENTIAL',
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json()
  const validation = createCredentialSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
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

  if (platformId) {
    const platform = await prisma.platform.findUnique({
      where: { id: platformId },
      select: { supportsLogin: true, supportsApiToken: true, supportsClientSecret: true },
    })

    if (!platform) {
      return NextResponse.json({ error: 'Plataforma não encontrada' }, { status: 404 })
    }

    const supported =
      (type === 'LOGIN_PASSWORD' && platform.supportsLogin) ||
      (type === 'API_TOKEN' && platform.supportsApiToken) ||
      (type === 'CLIENT_SECRET' && platform.supportsClientSecret)

    if (!supported) {
      return NextResponse.json(
        { error: 'Tipo de credencial não suportado pela plataforma' },
        { status: 400 }
      )
    }
  }

  if (type === 'LOGIN_PASSWORD' && !password) {
    return NextResponse.json({ error: 'Senha obrigatória' }, { status: 400 })
  }
  if (type === 'API_TOKEN' && !token) {
    return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })
  }
  if (type === 'CLIENT_SECRET' && (!clientId || !clientSecret)) {
    return NextResponse.json({ error: 'Client ID e Client Secret são obrigatórios' }, { status: 400 })
  }

  const encryptedPassword = password ? encryptSystemData(password) : null
  const encryptedToken = token ? encryptSystemData(token) : null
  const encryptedClientId = clientId ? encryptSystemData(clientId) : null
  const encryptedClientSecret = clientSecret ? encryptSystemData(clientSecret) : null

  const credential = await prisma.credential.create({
    data: {
      ...credentialData,
      type,
      username: type === 'LOGIN_PASSWORD' ? username || null : null,
      platformId: platformId || null,
      machineId: machineId || null,
      encryptedPass: type === 'LOGIN_PASSWORD' ? encryptedPassword : null,
      encryptedToken: type === 'API_TOKEN' ? encryptedToken : null,
      encryptedClientId: type === 'CLIENT_SECRET' ? encryptedClientId : null,
      encryptedClientSecret: type === 'CLIENT_SECRET' ? encryptedClientSecret : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdById: session.user.id,
    },
    include: {
      platform: { select: { id: true, name: true } },
      machine: { select: { id: true, hostname: true } },
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'CREDENTIAL',
    resourceId: credential.id,
    resourceName: credential.name,
    newValue: { name: credential.name, username: credential.username },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(credential, { status: 201 })
}
