import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { checkPermission } from '@/lib/auth/permissions'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const hours = parseInt(searchParams.get('hours') || '24')

  // Verificar permissão
  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  if (!isAdmin) {
    const hasPermission = await checkPermission({
      userId: session.user.id,
      action: 'READ',
      resource: 'MACHINE',
      resourceId: id,
    })

    if (!hasPermission) {
      // Verificar se é o criador
      const machine = await prisma.machine.findUnique({
        where: { id },
        select: { createdById: true },
      })

      if (machine?.createdById !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  // Buscar dados da máquina
  const machine = await prisma.machine.findUnique({
    where: { id },
    select: {
      id: true,
      hostname: true,
      ip: true,
      os: true,
      osVersion: true,
      specs: true,
      telemetryEnabled: true,
      telemetryIntervalMin: true,
      telemetryInstalledAt: true,
      lastTelemetryAt: true,
      sshPort: true,
      encryptedUser: true,
      encryptedPass: true,
      encryptedSSHKey: true,
    },
  })

  if (!machine) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Buscar histórico de telemetria
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const telemetryHistory = await prisma.machineTelemetry.findMany({
    where: {
      machineId: id,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      cpuUsage: true,
      cpuCores: true,
      memoryTotalMb: true,
      memoryAvailMb: true,
      memoryUsedMb: true,
      memoryPercent: true,
      diskTotalGb: true,
      diskUsedGb: true,
      diskPercent: true,
      loadAvg1: true,
      loadAvg5: true,
      loadAvg15: true,
      containers: true,
      createdAt: true,
    },
  })

  // Última telemetria
  const latestTelemetry = telemetryHistory.length > 0
    ? telemetryHistory[telemetryHistory.length - 1]
    : null

  return NextResponse.json({
    machine: {
      id: machine.id,
      hostname: machine.hostname,
      ip: machine.ip,
      os: machine.os,
      osVersion: machine.osVersion,
      specs: machine.specs,
      telemetryEnabled: machine.telemetryEnabled,
      telemetryIntervalMin: machine.telemetryIntervalMin,
      telemetryInstalledAt: machine.telemetryInstalledAt,
      lastTelemetryAt: machine.lastTelemetryAt,
      hasSshAccess: Boolean(
        (machine.encryptedUser && machine.encryptedPass) || machine.encryptedSSHKey
      ),
      sshPort: machine.sshPort,
    },
    latestTelemetry,
    history: telemetryHistory,
  })
}
