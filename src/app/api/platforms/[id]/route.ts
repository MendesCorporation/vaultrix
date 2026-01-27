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
  .nullable()
  .refine((value) => {
    if (!value) return true
    return value.startsWith('/uploads/') || value.startsWith('http://') || value.startsWith('https://')
  }, { message: 'Invalid logo url' })

const updatePlatformSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  logoUrl: logoUrlSchema,
  category: z.string().max(100).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  supportsLogin: z.boolean().optional(),
  supportsApiToken: z.boolean().optional(),
  supportsClientSecret: z.boolean().optional(),
  isProvider: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const platform = await prisma.platform.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { credentials: true } },
    },
  })

  if (!platform) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(platform)
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
    resource: 'PLATFORM',
    resourceId: params.id,
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = updatePlatformSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const existingPlatform = await prisma.platform.findUnique({
    where: { id: params.id },
  })

  if (!existingPlatform) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check if new name conflicts with another platform
  if (validation.data.name && validation.data.name !== existingPlatform.name) {
    const nameConflict = await prisma.platform.findUnique({
      where: { name: validation.data.name },
    })
    if (nameConflict) {
      return NextResponse.json(
        { error: 'Platform with this name already exists' },
        { status: 409 }
      )
    }
  }

  const nextSupports = {
    supportsLogin: validation.data.supportsLogin ?? existingPlatform.supportsLogin,
    supportsApiToken: validation.data.supportsApiToken ?? existingPlatform.supportsApiToken,
    supportsClientSecret: validation.data.supportsClientSecret ?? existingPlatform.supportsClientSecret,
  }

  if (!nextSupports.supportsLogin && !nextSupports.supportsApiToken && !nextSupports.supportsClientSecret) {
    return NextResponse.json(
      { error: 'Select at least one credential type' },
      { status: 400 }
    )
  }

  const nextName = validation.data.name ?? existingPlatform.name
  const nextDescription =
    validation.data.description !== undefined
      ? validation.data.description
      : existingPlatform.description
  const nextIsProvider = validation.data.isProvider ?? existingPlatform.isProvider

  const providerByOldName = await prisma.machineProvider.findUnique({
    where: { name: existingPlatform.name },
  })

  if (nextIsProvider && providerByOldName && nextName !== existingPlatform.name) {
    const providerConflict = await prisma.machineProvider.findUnique({
      where: { name: nextName },
    })
    if (providerConflict && providerConflict.id !== providerByOldName.id) {
      return NextResponse.json(
        { error: 'Provider with this name already exists' },
        { status: 409 }
      )
    }
  }

  const platform = await prisma.platform.update({
    where: { id: params.id },
    data: {
      ...validation.data,
      supportsLogin: nextSupports.supportsLogin,
      supportsApiToken: nextSupports.supportsApiToken,
      supportsClientSecret: nextSupports.supportsClientSecret,
      isProvider: nextIsProvider,
    },
  })

  if (nextIsProvider) {
    if (providerByOldName) {
      if (nextName !== existingPlatform.name) {
        await prisma.machineProvider.update({
          where: { id: providerByOldName.id },
          data: {
            name: nextName,
            description: nextDescription || undefined,
          },
        })
      } else if (validation.data.description !== undefined) {
        await prisma.machineProvider.update({
          where: { id: providerByOldName.id },
          data: { description: nextDescription || undefined },
        })
      }
    } else {
      const existingByNewName = await prisma.machineProvider.findUnique({
        where: { name: nextName },
      })
      if (!existingByNewName) {
        await prisma.machineProvider.create({
          data: {
            name: nextName,
            description: nextDescription || undefined,
          },
        })
      }
    }
  } else if (existingPlatform.isProvider) {
    if (providerByOldName) {
      const inUse = await prisma.machine.count({
        where: { providerId: providerByOldName.id },
      })
      if (!inUse) {
        await prisma.machineProvider.delete({ where: { id: providerByOldName.id } })
      }
    }
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'PLATFORM',
    resourceId: platform.id,
    resourceName: platform.name,
    oldValue: {
      name: existingPlatform.name,
      category: existingPlatform.category,
      isProvider: existingPlatform.isProvider,
    },
    newValue: {
      name: platform.name,
      category: platform.category,
      isProvider: platform.isProvider,
    },
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(platform)
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
    resource: 'PLATFORM',
    resourceId: params.id,
  })

  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const platform = await prisma.platform.findUnique({
    where: { id: params.id },
    include: { _count: { select: { credentials: true } } },
  })

  if (!platform) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (platform._count.credentials > 0) {
    return NextResponse.json(
      { error: 'Cannot delete platform with associated credentials' },
      { status: 400 }
    )
  }

  await prisma.platform.delete({
    where: { id: params.id },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'PLATFORM',
    resourceId: platform.id,
    resourceName: platform.name,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
