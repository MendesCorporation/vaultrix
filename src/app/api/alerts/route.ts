import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { checkPermission, getResourceAccess } from '@/lib/auth/permissions'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'

const alertSchema = z.object({
  name: z.string().min(1).max(120),
  machineId: z.string().optional().nullable(),
  allMachines: z.boolean().optional().default(false),
  cpuThreshold: z.number().min(1).max(100).optional().nullable(),
  memoryThreshold: z.number().min(1).max(100).optional().nullable(),
  containerDown: z.boolean().optional().default(false),
  machineOffline: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alerts = await prisma.alert.findMany({
    where: { userId: session.user.id },
    include: {
      machine: { select: { id: true, hostname: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ data: alerts })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = alertSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const data = validation.data
  const hasCondition = Boolean(
    data.cpuThreshold !== null && data.cpuThreshold !== undefined
  ) || Boolean(
    data.memoryThreshold !== null && data.memoryThreshold !== undefined
  ) || Boolean(data.containerDown) || Boolean(data.machineOffline)

  if (!hasCondition) {
    return NextResponse.json({ error: 'Selecione pelo menos uma condição' }, { status: 400 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'
  const machineId = data.allMachines ? null : data.machineId || null

  if (!data.allMachines && !machineId) {
    return NextResponse.json({ error: 'Selecione uma máquina' }, { status: 400 })
  }

  if (machineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: machineId },
      select: { id: true, createdById: true, hostname: true },
    })

    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 })
    }

    if (!isAdmin && machine.createdById !== session.user.id) {
      const hasPermission = await checkPermission({
        userId: session.user.id,
        action: 'READ',
        resource: 'MACHINE',
        resourceId: machineId,
      })
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  } else if (!isAdmin) {
    const access = await getResourceAccess({
      userId: session.user.id,
      resourceType: 'MACHINE',
      action: 'READ',
    })

    const where: any = { isActive: true }
    if (!access.hasGlobalAccess) {
      where.OR = [{ createdById: session.user.id }]
      if (access.resourceIds.length > 0) {
        where.OR.push({ id: { in: access.resourceIds } })
      }
    }

    const count = await prisma.machine.count({ where })
    if (count === 0) {
      return NextResponse.json({ error: 'Nenhuma máquina disponível para alertas' }, { status: 403 })
    }
  }

  const alert = await prisma.alert.create({
    data: {
      name: data.name,
      userId: session.user.id,
      machineId,
      cpuThreshold: data.cpuThreshold ?? null,
      memoryThreshold: data.memoryThreshold ?? null,
      containerDown: Boolean(data.containerDown),
      machineOffline: Boolean(data.machineOffline),
      isActive: data.isActive ?? true,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    resourceType: 'ALERT',
    resourceId: alert.id,
    resourceName: alert.name,
    metadata: {
      scope: machineId ? 'machine' : 'all',
      machineId: machineId ?? undefined,
    },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(alert, { status: 201 })
}
