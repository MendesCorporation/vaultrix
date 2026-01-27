import { auth } from '@/lib/auth/config'
import { prisma } from '@/lib/db/prisma'
import { getResourceAccess } from '@/lib/auth/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Server, Key, Cloud, Users, Activity, AlertTriangle, Bell } from 'lucide-react'
import { getInitialLocale } from '@/lib/i18n/server'
import { getDictionary, translate } from '@/lib/i18n'
import { localeTag } from '@/lib/i18n/locales'

type TelemetrySnapshot = {
  machineId: string
  cpuUsage: number | null
  memoryPercent: number | null
  containers: any
  createdAt: Date
}

async function buildAccessWhere(userId: string, isAdmin: boolean, resourceType: 'MACHINE' | 'CREDENTIAL') {
  if (isAdmin) {
    return { isActive: true }
  }

  const access = await getResourceAccess({
    userId,
    resourceType,
    action: 'READ',
  })

  if (access.isAdmin || access.hasGlobalAccess) {
    return { isActive: true }
  }

  const where: any = { isActive: true, OR: [{ createdById: userId }] }
  if (access.resourceIds.length > 0) {
    where.OR.push({ id: { in: access.resourceIds } })
  }

  return where
}

async function getStats(userId: string, isAdmin: boolean) {
  const machineWhere = await buildAccessWhere(userId, isAdmin, 'MACHINE')
  const credentialWhere = await buildAccessWhere(userId, isAdmin, 'CREDENTIAL')

  const [
    machinesCount,
    credentialsCount,
    usersCount,
    recentLogs,
    alertsCount,
    machines,
    platformsCount,
  ] = await Promise.all([
    prisma.machine.count({ where: machineWhere }),
    prisma.credential.count({ where: credentialWhere }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.auditLog.findMany({
      where: isAdmin ? undefined : { userId },
      take: 5,
      orderBy: { timestamp: 'desc' },
      include: {
        user: { select: { name: true } },
      },
    }),
    prisma.alert.count({ where: isAdmin ? undefined : { userId } }),
    prisma.machine.findMany({
      where: machineWhere,
      select: { id: true, hostname: true },
    }),
    isAdmin
      ? prisma.platform.count()
      : prisma.credential
        .findMany({
          where: {
            ...credentialWhere,
            platformId: { not: null },
          },
          select: { platformId: true },
          distinct: ['platformId'],
        })
        .then((rows) => rows.filter((row) => row.platformId).length),
  ])

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const machineIds = machines.map((machine) => machine.id)
  const latestTelemetry = machineIds.length
    ? await prisma.machineTelemetry.findMany({
      where: {
        machineId: { in: machineIds },
        createdAt: { gte: yesterday },
      },
      select: {
        machineId: true,
        cpuUsage: true,
        memoryPercent: true,
        containers: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['machineId'],
    })
    : []

  return {
    machinesCount,
    credentialsCount,
    platformsCount,
    usersCount,
    recentLogs,
    alertsCount,
    machines,
    telemetry: latestTelemetry as TelemetrySnapshot[],
  }
}

export default async function DashboardPage() {
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPER_ADMIN'
  const stats = await getStats(session?.user?.id || '', Boolean(isAdmin))
  const locale = getInitialLocale()
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(dictionary, key, values)
  const dateLocale = localeTag(locale)

  const cards = isAdmin
    ? [
      {
        title: t('nav.machines'),
        value: stats.machinesCount,
        icon: Server,
        color: 'bg-blue-500',
      },
      {
        title: t('nav.credentials'),
        value: stats.credentialsCount,
        icon: Key,
        color: 'bg-green-500',
      },
      {
        title: t('nav.platforms'),
        value: stats.platformsCount,
        icon: Cloud,
        color: 'bg-purple-500',
      },
      {
        title: t('nav.users'),
        value: stats.usersCount,
        icon: Users,
        color: 'bg-orange-500',
      },
    ]
    : [
      {
        title: t('dashboard.cards.machines'),
        value: stats.machinesCount,
        icon: Server,
        color: 'bg-blue-500',
      },
      {
        title: t('dashboard.cards.credentials'),
        value: stats.credentialsCount,
        icon: Key,
        color: 'bg-green-500',
      },
      {
        title: t('dashboard.cards.platformsLinked'),
        value: stats.platformsCount,
        icon: Cloud,
        color: 'bg-purple-500',
      },
      {
        title: t('dashboard.cards.alerts'),
        value: stats.alertsCount,
        icon: Bell,
        color: 'bg-orange-500',
      },
    ]

  const actionLabels: Record<string, string> = {
    CREATE: t('dashboard.actionLabels.CREATE'),
    READ: t('dashboard.actionLabels.READ'),
    UPDATE: t('dashboard.actionLabels.UPDATE'),
    DELETE: t('dashboard.actionLabels.DELETE'),
    LOGIN: t('dashboard.actionLabels.LOGIN'),
    LOGOUT: t('dashboard.actionLabels.LOGOUT'),
    LOGIN_FAILED: t('dashboard.actionLabels.LOGIN_FAILED'),
    SECRET_VIEWED: t('dashboard.actionLabels.SECRET_VIEWED'),
  }

  const telemetryMap = new Map<string, TelemetrySnapshot>()
  stats.telemetry.forEach((telemetry) => {
    telemetryMap.set(telemetry.machineId, telemetry)
  })

  const warningCounts = {
    cpu: 0,
    memory: 0,
    container: 0,
  }

  const isContainerRunning = (container: { state?: string; status?: string }) => {
    const state = (container.state || '').toLowerCase()
    if (state) {
      return state === 'running'
    }
    const status = (container.status || '').toLowerCase()
    if (status.startsWith('up')) {
      return true
    }
    return false
  }

  for (const machine of stats.machines) {
    const telemetry = telemetryMap.get(machine.id)
    if (!telemetry) continue

    if (telemetry.cpuUsage !== null && telemetry.cpuUsage !== undefined && telemetry.cpuUsage >= 80) {
      warningCounts.cpu += 1
    }

    if (telemetry.memoryPercent !== null && telemetry.memoryPercent !== undefined && telemetry.memoryPercent >= 80) {
      warningCounts.memory += 1
    }

    const containers = Array.isArray(telemetry.containers) ? telemetry.containers : []
    const downContainers = containers.filter((container) => !isContainerRunning(container))
    if (downContainers.length > 0) {
      warningCounts.container += 1
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-dark-500 dark:text-dark-400">
          {t('dashboard.welcome', { name: session?.user?.name || t('common.system') })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.color}`}>
                <card.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-dark-500 dark:text-dark-400">{card.title}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary-500" />
              {t('dashboard.recentActivity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentLogs.length === 0 ? (
              <p className="text-center text-dark-500">{t('dashboard.noRecentActivity')}</p>
            ) : (
              <div className="space-y-4">
                {stats.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 border-b border-dark-100 pb-3 last:border-0 dark:border-dark-700"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                      {log.user?.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{log.user?.name || t('common.system')}</span>{' '}
                        {actionLabels[log.action] || log.action.toLowerCase()}{' '}
                        {log.resourceName && (
                          <span className="font-medium">{log.resourceName}</span>
                        )}
                      </p>
                      <p className="text-xs text-dark-500">
                        {new Date(log.timestamp).toLocaleString(dateLocale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary-500" />
              {t('dashboard.warningsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { key: 'cpu', label: t('dashboard.warnings.cpu'), count: warningCounts.cpu },
                { key: 'memory', label: t('dashboard.warnings.memory'), count: warningCounts.memory },
                { key: 'container', label: t('dashboard.warnings.container'), count: warningCounts.container },
              ].map((warning) => {
                const isActive = warning.count > 0
                return (
                  <div
                    key={warning.key}
                    className={`flex items-center justify-between rounded-lg p-3 ${isActive
                        ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                        : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${isActive ? 'bg-yellow-500' : 'bg-green-500'}`}
                      />
                      <span className="text-sm font-medium">{warning.label}</span>
                    </div>
                    <span className="text-xs">
                      {isActive
                        ? t('dashboard.warnings.count', { count: warning.count })
                        : t('dashboard.warnings.ok')}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
