import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { checkPermission } from '@/lib/auth/permissions'
import { createAuditLog } from '@/lib/db/queries/audit'
import { getClientIP } from '@/lib/security'

const updateAlertSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  machineId: z.string().optional().nullable(),
  allMachines: z.boolean().optional(),
  cpuThreshold: z.number().min(1).max(100).optional().nullable(),
  memoryThreshold: z.number().min(1).max(100).optional().nullable(),
  containerDown: z.boolean().optional(),
  machineOffline: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alert = await prisma.alert.findUnique({
    where: { id: params.id },
    include: { machine: { select: { id: true, hostname: true } } },
  })

  if (!alert || alert.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(alert)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alert = await prisma.alert.findUnique({
    where: { id: params.id },
  })

  if (!alert || alert.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const validation = updateAlertSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const data = validation.data
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  let nextMachineId = alert.machineId
  if (data.allMachines === true) {
    nextMachineId = null
  } else if (data.machineId !== undefined) {
    nextMachineId = data.machineId || null
  }

  if (nextMachineId) {
    const machine = await prisma.machine.findUnique({
      where: { id: nextMachineId },
      select: { id: true, createdById: true },
    })
    if (!machine) {
      return NextResponse.json({ error: 'Máquina não encontrada' }, { status: 404 })
    }
    if (!isAdmin && machine.createdById !== session.user.id) {
      const hasPermission = await checkPermission({
        userId: session.user.id,
        action: 'READ',
        resource: 'MACHINE',
        resourceId: nextMachineId,
      })
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  const nextCpu = data.cpuThreshold !== undefined ? data.cpuThreshold : alert.cpuThreshold
  const nextMemory = data.memoryThreshold !== undefined ? data.memoryThreshold : alert.memoryThreshold
  const nextContainer = data.containerDown !== undefined ? data.containerDown : alert.containerDown
  const nextOffline = data.machineOffline !== undefined ? data.machineOffline : alert.machineOffline

  const hasCondition = Boolean(nextCpu !== null && nextCpu !== undefined)
    || Boolean(nextMemory !== null && nextMemory !== undefined)
    || Boolean(nextContainer)
    || Boolean(nextOffline)

  if (!hasCondition) {
    return NextResponse.json({ error: 'Selecione pelo menos uma condicao' }, { status: 400 })
  }

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: {
      name: data.name ?? alert.name,
      machineId: nextMachineId,
      cpuThreshold: data.cpuThreshold !== undefined ? data.cpuThreshold : alert.cpuThreshold,
      memoryThreshold: data.memoryThreshold !== undefined ? data.memoryThreshold : alert.memoryThreshold,
      containerDown: data.containerDown !== undefined ? data.containerDown : alert.containerDown,
      machineOffline: data.machineOffline !== undefined ? data.machineOffline : alert.machineOffline,
      isActive: data.isActive !== undefined ? data.isActive : alert.isActive,
    },
  })

  if (data.isActive === false) {
    await prisma.alertState.updateMany({
      where: { alertId: alert.id },
      data: { active: false, isActive: false, lastResolvedAt: new Date(), resolvedAt: new Date() },
    })
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    resourceType: 'ALERT',
    resourceId: updated.id,
    resourceName: updated.name,
    metadata: { scope: nextMachineId ? 'machine' : 'all' },
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const alert = await prisma.alert.findUnique({
    where: { id: params.id },
  })

  if (!alert || alert.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.alert.delete({ where: { id: alert.id } })

  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    resourceType: 'ALERT',
    resourceId: alert.id,
    resourceName: alert.name,
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  })

  return NextResponse.json({ success: true })
}
