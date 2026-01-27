import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { encryptSystemData } from '@/lib/crypto'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission, getResourceAccess } from '@/lib/auth/permissions'
import { getClientIP } from '@/lib/security'

const createMachineSchema = z.object({
  hostname: z.string().min(1).max(255),
  ip: z.string().optional(),
  description: z.string().max(1000).optional(),
  os: z.string().max(100).optional(),
  osVersion: z.string().max(50).optional(),
  specs: z.object({
    cpu: z.string().optional(),
    ram: z.string().optional(),
    storage: z.string().optional(),
  }).optional(),
  providerId: z.string().optional().nullable(),
  username: z.string().max(255).optional(),
  password: z.string().optional(),
  sshKey: z.string().optional(),
  sshPort: z.number().int().min(1).max(65535).default(22),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
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

  const where: any = { isActive: true }

  const access = await getResourceAccess({
    userId: session.user.id,
    resourceType: 'MACHINE',
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
      { hostname: { contains: search, mode: 'insensitive' } },
      { ip: { contains: search } },
      { description: { contains: search, mode: 'insensitive' } },
    ]

    if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchFilter }]
      delete where.OR
    } else {
      where.OR = searchFilter
    }
  }

  const [machines, total] = await Promise.all([
    prisma.machine.findMany({
      where,
      select: {
        id: true,
        hostname: true,
        ip: true,
        description: true,
        os: true,
        osVersion: true,
        specs: true,
        provider: { select: { id: true, name: true } },
        sshPort: true,
        tags: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { credentials: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.machine.count({ where }),
  ])

  return NextResponse.json({
    data: machines,
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
      resource: 'MACHINE',
    })

    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json()
  const validation = createMachineSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { username, password, sshKey, providerId, ...machineData } = validation.data

  // Validar se o provider existe (se foi fornecido)
  if (providerId) {
    const providerExists = await prisma.machineProvider.findUnique({
      where: { id: providerId },
    })
    if (!providerExists) {
      return NextResponse.json(
        { error: 'Provider não encontrado' },
        { status: 400 }
      )
    }
  }

  // Criptografar dados sensíveis antes de armazenar
  const encryptedUser = username ? encryptSystemData(username) : null
  const encryptedPass = password ? encryptSystemData(password) : null
  const encryptedSSHKey = sshKey ? encryptSystemData(sshKey) : null

  const machine = await prisma.machine.create({
    data: {
      ...machineData,
      providerId: providerId || null,
      encryptedUser,
      encryptedPass,
      encryptedSSHKey,
      createdById: session.user.id,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'MACHINE',
    resourceId: machine.id,
    resourceName: machine.hostname,
    newValue: { hostname: machine.hostname, ip: machine.ip },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(machine, { status: 201 })
}
