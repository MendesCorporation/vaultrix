import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN'

  // Get user's alerts
  const userAlerts = await prisma.alert.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  })

  const alertIds = userAlerts.map((a) => a.id)

  // Get active alert states for user's alerts
  const notifications = await prisma.alertState.findMany({
    where: {
      OR: [
        { alertId: { in: alertIds } },
        ...(isAdmin ? [{ type: 'MACHINE_OFFLINE' }] : []),
      ],
      isActive: true,
    },
    include: {
      alert: {
        select: { id: true, name: true, userId: true },
      },
      machine: {
        select: { id: true, hostname: true, ip: true },
      },
    },
    orderBy: { triggeredAt: 'desc' },
    take: 20,
  })

  // Count total active
  const count = await prisma.alertState.count({
    where: {
      OR: [
        { alertId: { in: alertIds } },
        ...(isAdmin ? [{ type: 'MACHINE_OFFLINE' }] : []),
      ],
      isActive: true,
    },
  })

  return NextResponse.json({
    data: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      machineName: n.machine.hostname,
      machineIp: n.machine.ip,
      machineId: n.machineId,
      alertName: n.alert?.name,
      triggeredAt: n.triggeredAt,
      key: n.key,
      lastValue: n.lastValue,
    })),
    count,
  })
}
