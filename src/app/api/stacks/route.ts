import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/db/queries/audit'
import { checkPermission } from '@/lib/auth/permissions'

const imageUrlSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine((value) => {
    if (!value) return true
    return value.startsWith('/uploads/') || value.startsWith('http://') || value.startsWith('https://')
  }, { message: 'Invalid image url' })

const createStackSchema = z.object({
  name: z.string().min(1).max(255),
  imageUrl: imageUrlSchema,
  env: z.string().max(10000).optional().or(z.literal('')),
  dockerCompose: z.string().max(20000).optional().or(z.literal('')),
  instructions: z.string().max(10000).optional().or(z.literal('')),
  mode: z.enum(['manual', 'automatic']).default('manual'),
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

  const where: any = {}

  if (search) {
    where.OR = [{ name: { contains: search, mode: 'insensitive' } }]
  }

  const [stacks, total] = await Promise.all([
    prisma.stack.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stack.count({ where }),
  ])

  return NextResponse.json({
    data: stacks,
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
    resource: 'STACK',
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = createStackSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existing = await prisma.stack.findUnique({
    where: { name: validation.data.name },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Stack with this name already exists' },
      { status: 409 }
    )
  }

  const data = {
    name: validation.data.name,
    imageUrl: validation.data.imageUrl || null,
    env: validation.data.env || null,
    dockerCompose: validation.data.dockerCompose || null,
    instructions: validation.data.instructions || null,
    mode: validation.data.mode,
  }

  const stack = await prisma.stack.create({ data })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'STACK',
    resourceId: stack.id,
    resourceName: stack.name,
    newValue: { name: stack.name },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(stack, { status: 201 })
}
