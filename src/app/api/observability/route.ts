import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { getResourceAccess } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await getResourceAccess({
    userId: session.user.id,
    resourceType: 'MACHINE',
    action: 'READ',
  })

  const where: any = { isActive: true }
  if (!access.isAdmin && !access.hasGlobalAccess) {
    where.OR = [{ createdById: session.user.id }]
    if (access.resourceIds.length > 0) {
      where.OR.push({ id: { in: access.resourceIds } })
    }
  }

  const machines = await prisma.machine.findMany({
    where,
    select: {
      id: true,
      hostname: true,
      ip: true,
      telemetryToken: true,
      telemetryEnabled: true,
      telemetryIntervalMin: true,
      telemetryInstalledAt: true,
      lastTelemetryAt: true,
      encryptedUser: true,
      encryptedPass: true,
      encryptedSSHKey: true,
      sshPort: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const telemetryByMachine: Record<string, any> = {}
  for (const machine of machines) {
    const telemetry = await prisma.machineTelemetry.findFirst({
      where: { machineId: machine.id },
      orderBy: { createdAt: 'desc' },
    })
    telemetryByMachine[machine.id] = telemetry
  }

  return NextResponse.json({
    data: machines.map((machine) => ({
      id: machine.id,
      hostname: machine.hostname,
      ip: machine.ip,
      telemetryEnabled: machine.telemetryEnabled,
      telemetryIntervalMin: machine.telemetryIntervalMin,
      telemetryInstalledAt: machine.telemetryInstalledAt,
      lastTelemetryAt: machine.lastTelemetryAt,
      hasTelemetryToken: Boolean(machine.telemetryToken),
      hasSshAccess: Boolean(
        (machine.encryptedUser && machine.encryptedPass) || machine.encryptedSSHKey
      ),
      sshPort: machine.sshPort,
      latestTelemetry: telemetryByMachine[machine.id] || null,
    })),
  })
}
