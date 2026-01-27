import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'

const logoUrlSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((value) => {
    if (!value) return true
    return value.startsWith('/uploads/') || value.startsWith('http://') || value.startsWith('https://')
  }, { message: 'Invalid logo url' })

const createPlatformSchema = z.object({
  name: z.string().min(1).max(255),
  logoUrl: logoUrlSchema,
  category: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  supportsLogin: z.boolean().optional().default(false),
  supportsApiToken: z.boolean().optional().default(false),
  supportsClientSecret: z.boolean().optional().default(false),
  isProvider: z.boolean().optional().default(false),
}).refine((data) => {
  // Exatamente um tipo de credencial deve ser suportado
  const supportTypes = [
    data.supportsLogin,
    data.supportsApiToken,
    data.supportsClientSecret
  ].filter(Boolean)
  
  return supportTypes.length === 1
}, {
  message: "Exatamente um tipo de credencial deve ser selecionado",
  path: ["credentialType"]
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const search = searchParams.get('search') || ''
  const all = searchParams.get('all') === 'true'
  const credentialType = searchParams.get('credentialType') // Filtro por tipo de credencial

  const where: any = {}

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Filtrar por tipo de credencial suportado
  if (credentialType) {
    switch (credentialType) {
      case 'LOGIN_PASSWORD':
        where.supportsLogin = true
        break
      case 'API_TOKEN':
        where.supportsApiToken = true
        break
      case 'CLIENT_SECRET':
        where.supportsClientSecret = true
        break
    }
  }

  if (all) {
    const platforms = await prisma.platform.findMany({
      where,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ data: platforms })
  }

  const [platforms, total] = await Promise.all([
    prisma.platform.findMany({
      where,
      include: {
        _count: { select: { credentials: true } },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.platform.count({ where }),
  ])

  return NextResponse.json({
    data: platforms,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasPermission = await checkPermission({
    userId: session.user.id,
    action: 'CREATE',
    resource: 'PLATFORM',
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = createPlatformSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const payload = {
    ...validation.data,
    supportsLogin: validation.data.supportsLogin ?? true,
    supportsApiToken: validation.data.supportsApiToken ?? false,
    supportsClientSecret: validation.data.supportsClientSecret ?? false,
    isProvider: validation.data.isProvider ?? false,
  }

  if (!payload.supportsLogin && !payload.supportsApiToken && !payload.supportsClientSecret) {
    return NextResponse.json(
      { error: 'Select at least one credential type' },
      { status: 400 }
    )
  }

  // Check if name already exists
  const existing = await prisma.platform.findUnique({
    where: { name: payload.name },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Platform with this name already exists' },
      { status: 409 }
    )
  }

  const platform = await prisma.platform.create({
    data: payload,
  })

  if (payload.isProvider) {
    await prisma.machineProvider.upsert({
      where: { name: platform.name },
      update: { description: platform.description || undefined },
      create: {
        name: platform.name,
        description: platform.description || undefined,
      },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'PLATFORM',
    resourceId: platform.id,
    resourceName: platform.name,
    newValue: {
      name: platform.name,
      category: platform.category,
      isProvider: platform.isProvider,
    },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(platform, { status: 201 })
}
