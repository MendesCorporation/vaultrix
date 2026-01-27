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
  .nullable()
  .refine((value) => {
    if (!value) return true
    return value.startsWith('/uploads/') || value.startsWith('http://') || value.startsWith('https://')
  }, { message: 'Invalid image url' })

const updateStackSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  imageUrl: imageUrlSchema,
  env: z.string().max(10000).optional().or(z.literal('')).nullable(),
  dockerCompose: z.string().max(20000).optional().or(z.literal('')).nullable(),
  instructions: z.string().max(10000).optional().or(z.literal('')).nullable(),
  mode: z.enum(['manual', 'automatic']).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stack = await prisma.stack.findUnique({
    where: { id: params.id },
  })

  if (!stack) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(stack)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasPermission = await checkPermission({
    userId: session.user.id,
    action: 'UPDATE',
    resource: 'STACK',
    resourceId: params.id,
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = updateStackSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existingStack = await prisma.stack.findUnique({
    where: { id: params.id },
  })

  if (!existingStack) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (validation.data.name && validation.data.name !== existingStack.name) {
    const nameConflict = await prisma.stack.findUnique({
      where: { name: validation.data.name },
    })
    if (nameConflict) {
      return NextResponse.json(
        { error: 'Stack with this name already exists' },
        { status: 409 }
      )
    }
  }

  const updateData = {
    ...validation.data,
    imageUrl: validation.data.imageUrl === '' ? null : validation.data.imageUrl,
    env: validation.data.env === '' ? null : validation.data.env,
    dockerCompose: validation.data.dockerCompose === '' ? null : validation.data.dockerCompose,
    instructions: validation.data.instructions === '' ? null : validation.data.instructions,
  }

  const stack = await prisma.stack.update({
    where: { id: params.id },
    data: updateData,
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'STACK',
    resourceId: stack.id,
    resourceName: stack.name,
    oldValue: { name: existingStack.name },
    newValue: { name: stack.name },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(stack)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hasPermission = await checkPermission({
    userId: session.user.id,
    action: 'DELETE',
    resource: 'STACK',
    resourceId: params.id,
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const stack = await prisma.stack.findUnique({
    where: { id: params.id },
  })

  if (!stack) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.stack.delete({
    where: { id: params.id },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'STACK',
    resourceId: stack.id,
    resourceName: stack.name,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
