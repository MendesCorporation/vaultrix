import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const createConfigSchema = z.object({
  name: z.string().min(1),
  destination: z.enum(['local', 'remote']),
  machineId: z.string().nullable().optional(),
  folder: z.string().min(1),
  retentionDays: z.number().int().min(0).max(365),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/),
  scheduleDays: z.array(z.string()),
  isActive: z.boolean().optional(),
})

const updateConfigSchema = z.object({
  name: z.string().min(1).optional(),
  destination: z.enum(['local', 'remote']).optional(),
  machineId: z.string().nullable().optional(),
  folder: z.string().min(1).optional(),
  retentionDays: z.number().int().min(0).max(365).optional(),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  scheduleDays: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const configs = await prisma.backupConfig.findMany({
    include: {
      machine: {
        select: {
          id: true,
          hostname: true,
          ip: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return NextResponse.json(configs)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const validation = createConfigSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const data = validation.data

  if (data.destination === 'remote' && !data.machineId) {
    return NextResponse.json(
      { error: 'Machine ID is required for remote backups' },
      { status: 400 }
    )
  }

  if (data.destination === 'remote' && data.machineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: data.machineId },
    })

    if (!machine) {
      return NextResponse.json(
        { error: 'Machine not found' },
        { status: 400 }
      )
    }

    if (!machine.encryptedUser || (!machine.encryptedPass && !machine.encryptedSSHKey)) {
      return NextResponse.json(
        { error: 'Machine does not have SSH credentials configured' },
        { status: 400 }
      )
    }
  }

  const config = await prisma.backupConfig.create({
    data: {
      name: data.name,
      destination: data.destination,
      machineId: data.machineId,
      folder: data.folder,
      retentionDays: data.retentionDays,
      scheduleTime: data.scheduleTime,
      scheduleDays: data.scheduleDays,
      isActive: data.isActive ?? true,
    },
    include: {
      machine: {
        select: {
          id: true,
          hostname: true,
          ip: true,
        },
      },
    },
  })

  // Sincroniza os crons
  try {
    await fetch('http://localhost:3000/api/backup/sync-cron', { method: 'POST' })
  } catch (error) {
    console.error('Failed to sync cron:', error)
  }

  return NextResponse.json(config)
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, ...updateData } = body

  if (!id) {
    return NextResponse.json({ error: 'Config ID is required' }, { status: 400 })
  }

  const validation = updateConfigSchema.safeParse(updateData)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const data = validation.data

  if (data.destination === 'remote' && data.machineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: data.machineId },
    })

    if (!machine) {
      return NextResponse.json(
        { error: 'Machine not found' },
        { status: 400 }
      )
    }

    if (!machine.encryptedUser || (!machine.encryptedPass && !machine.encryptedSSHKey)) {
      return NextResponse.json(
        { error: 'Machine does not have SSH credentials configured' },
        { status: 400 }
      )
    }
  }

  const config = await prisma.backupConfig.update({
    where: { id },
    data,
    include: {
      machine: {
        select: {
          id: true,
          hostname: true,
          ip: true,
        },
      },
    },
  })

  // Sincroniza os crons
  try {
    await fetch('http://localhost:3000/api/backup/sync-cron', { method: 'POST' })
  } catch (error) {
    console.error('Failed to sync cron:', error)
  }

  return NextResponse.json(config)
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Config ID is required' }, { status: 400 })
  }

  await prisma.backupConfig.delete({
    where: { id },
  })

  // Sincroniza os crons
  try {
    await fetch('http://localhost:3000/api/backup/sync-cron', { method: 'POST' })
  } catch (error) {
    console.error('Failed to sync cron:', error)
  }

  return NextResponse.json({ success: true })
}

