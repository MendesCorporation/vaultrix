import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { hashToken } from '@/lib/security'
import { checkPermission } from '@/lib/auth/permissions'
import { sendAlertEmail } from '@/lib/email/mailer'
import { getDictionary, translate } from '@/lib/i18n'
import { localeTag, normalizeLocale } from '@/lib/i18n/locales'
import { checkOfflineMachines } from '@/lib/alerts/offline-check'

const telemetrySchema = z.object({
  token: z.string().min(16),
  metrics: z.object({
    cpu: z.number().optional(),
    cpu_cores: z.number().optional(),
    memory_total_mb: z.number().optional(),
    memory_avail_mb: z.number().optional(),
    memory_used_mb: z.number().optional(),
    memory_percent: z.number().optional(),
    disk_total_gb: z.number().optional(),
    disk_used_gb: z.number().optional(),
    disk_percent: z.number().optional(),
    load_avg_1: z.number().optional(),
    load_avg_5: z.number().optional(),
    load_avg_15: z.number().optional(),
  }),
  containers: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      image: z.string().optional(),
      state: z.string().optional(),
      status: z.string().optional(),
      cpuPercent: z.number().optional(),
      memUsage: z.string().optional(),
      memPercent: z.number().optional(),
      netIO: z.string().optional(),
      blockIO: z.string().optional(),
      pids: z.number().optional(),
    })
  ).optional(),
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const validation = telemetrySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.error.errors },
      { status: 400 }
    )
  }

  const { token, metrics, containers } = validation.data

  // Hash o token recebido para comparar com o armazenado
  const tokenHash = hashToken(token)

  const machine = await prisma.machine.findUnique({
    where: { telemetryToken: tokenHash },
    select: {
      id: true,
      hostname: true,
      ip: true,
      createdById: true,
      isActive: true,
      telemetryInstalledAt: true,
    },
  })

  if (!machine || !machine.isActive) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  await prisma.machineTelemetry.create({
    data: {
      machineId: machine.id,
      cpuUsage: metrics.cpu ?? null,
      cpuCores: metrics.cpu_cores != null ? Math.round(metrics.cpu_cores) : null,
      memoryTotalMb: metrics.memory_total_mb != null ? Math.round(metrics.memory_total_mb) : null,
      memoryAvailMb: metrics.memory_avail_mb != null ? Math.round(metrics.memory_avail_mb) : null,
      memoryUsedMb: metrics.memory_used_mb != null ? Math.round(metrics.memory_used_mb) : null,
      memoryPercent: metrics.memory_percent ?? null,
      diskTotalGb: metrics.disk_total_gb ?? null,
      diskUsedGb: metrics.disk_used_gb ?? null,
      diskPercent: metrics.disk_percent ?? null,
      loadAvg1: metrics.load_avg_1 ?? null,
      loadAvg5: metrics.load_avg_5 ?? null,
      loadAvg15: metrics.load_avg_15 ?? null,
      containers: containers ?? [],
    },
  })

  await prisma.machine.update({
    where: { id: machine.id },
    data: {
      lastTelemetryAt: new Date(),
      telemetryInstalledAt: machine.telemetryInstalledAt ?? new Date(),
      telemetryEnabled: true,
    },
  })

  await processAlerts({
    machine: {
      id: machine.id,
      hostname: machine.hostname,
      ip: machine.ip,
      createdById: machine.createdById,
    },
    metrics,
    containers: containers ?? [],
  })

  // Verificar máquinas offline (executa a cada telemetria recebida)
  // Isso garante que a verificação aconteça regularmente sem precisar de cron job
  try {
    await checkOfflineMachines()
  } catch (error) {
    console.error('Erro ao verificar máquinas offline:', error)
  }

  return NextResponse.json({ success: true })
}

async function processAlerts(params: {
  machine: { id: string; hostname: string; ip?: string | null; createdById: string }
  metrics: z.infer<typeof telemetrySchema>['metrics']
  containers: Array<{
    id?: string
    name: string
    image?: string
    state?: string
    status?: string
    cpuPercent?: number
    memUsage?: string
    memPercent?: number
    netIO?: string
    blockIO?: string
    pids?: number
  }>
}) {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        isActive: true,
        OR: [
          { machineId: params.machine.id },
          { machineId: null },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            locale: true,
          },
        },
      },
    })

    if (alerts.length === 0) return

    for (const alert of alerts) {
      const user = alert.user
      if (!user?.isActive || !user.email) continue

      const normalizedLocale = normalizeLocale(user.locale)
      const dictionary = getDictionary(normalizedLocale)
      const t = (key: string, values?: Record<string, string | number>) => translate(dictionary, key, values)
      const dateLocale = localeTag(normalizedLocale)
      const displayName = user.name || user.email || t('common.username')

      const canAccess = await canUserReadMachine(user, params.machine)
      if (!canAccess) continue

      const states = await prisma.alertState.findMany({
        where: { alertId: alert.id, machineId: params.machine.id },
      })
      const stateMap = new Map(states.map((state) => [state.key, state]))
      const now = new Date()

      const handleState = async (key: string, active: boolean, value: string, title: string, description: string, details?: Array<{ label: string; value: string }>) => {
        const existing = stateMap.get(key)

        if (active) {
          if (!existing || !existing.active) {
            // Buscar ou criar AlertState
            let alertState = await prisma.alertState.findFirst({
              where: {
                alertId: alert.id,
                machineId: params.machine.id,
                key: key
              }
            })

            if (!alertState) {
              alertState = await prisma.alertState.create({
                data: {
                  alertId: alert.id,
                  machineId: params.machine.id,
                  key,
                  active: true,
                  isActive: true,
                  lastTriggeredAt: now,
                  triggeredAt: now,
                  lastValue: value,
                }
              })
            } else {
              await prisma.alertState.update({
                where: { id: alertState.id },
                data: {
                  active: true,
                  isActive: true,
                  lastTriggeredAt: now,
                  triggeredAt: now,
                  lastValue: value,
                }
              })
            }

            try {
              await sendAlertEmail({
                to: user.email,
                name: displayName,
                locale: normalizedLocale,
                alertName: alert.name,
                title,
                description,
                machineName: params.machine.hostname,
                machineIp: params.machine.ip,
                details,
              })
            } catch (error) {
              console.error('Failed to send alert email:', error)
            }
          } else if (value && existing.lastValue !== value) {
            await prisma.alertState.update({
              where: { id: existing.id },
              data: { lastValue: value },
            })
          }
        } else if (existing?.active) {
          await prisma.alertState.update({
            where: { id: existing.id },
            data: { 
              active: false, 
              isActive: false,
              lastResolvedAt: now,
              resolvedAt: now
            },
          })
        }
      }

      if (alert.cpuThreshold !== null && alert.cpuThreshold !== undefined && params.metrics.cpu !== undefined) {
        const value = params.metrics.cpu
        const active = value >= alert.cpuThreshold
        const currentValue = value.toFixed(1)
        const limitValue = Number(alert.cpuThreshold).toFixed(1)
        await handleState(
          'cpu',
          active,
          currentValue,
          t('emails.alert.titles.cpu'),
          t('emails.alert.descriptions.cpu', { value: currentValue, limit: limitValue }),
          [
            { label: t('emails.alert.details.currentCpu'), value: `${currentValue}%` },
            { label: t('emails.alert.details.limit'), value: `${limitValue}%` },
            { label: t('emails.alert.details.time'), value: now.toLocaleString(dateLocale) },
          ]
        )
      }

      if (alert.memoryThreshold !== null && alert.memoryThreshold !== undefined && params.metrics.memory_percent !== undefined) {
        const value = params.metrics.memory_percent
        const active = value >= alert.memoryThreshold
        const currentValue = value.toFixed(1)
        const limitValue = Number(alert.memoryThreshold).toFixed(1)
        await handleState(
          'memory',
          active,
          currentValue,
          t('emails.alert.titles.memory'),
          t('emails.alert.descriptions.memory', { value: currentValue, limit: limitValue }),
          [
            { label: t('emails.alert.details.currentMemory'), value: `${currentValue}%` },
            { label: t('emails.alert.details.limit'), value: `${limitValue}%` },
            { label: t('emails.alert.details.time'), value: now.toLocaleString(dateLocale) },
          ]
        )
      }

      if (alert.containerDown && params.containers.length > 0) {
        const seenKeys = new Set<string>()
        for (const container of params.containers) {
          const key = `container:${container.name}`
          seenKeys.add(key)
          const isRunning = isContainerRunning(container)
          const active = !isRunning
          const statusText = container.status || container.state || t('common.unknown')
          await handleState(
            key,
            active,
            statusText,
            t('emails.alert.titles.container'),
            t('emails.alert.descriptions.container', { container: container.name }),
            [
              { label: t('emails.alert.details.container'), value: container.name },
              { label: t('emails.alert.details.status'), value: statusText },
              { label: t('emails.alert.details.time'), value: now.toLocaleString(dateLocale) },
            ]
          )
        }

        for (const state of states) {
          if (state.key && state.key.startsWith('container:') && state.active && !seenKeys.has(state.key)) {
            await prisma.alertState.update({
              where: { id: state.id },
              data: { 
                active: false, 
                isActive: false,
                lastResolvedAt: now,
                resolvedAt: now
              },
            })
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to process alerts:', error)
  }
}

async function canUserReadMachine(
  user: { id: string; role: string },
  machine: { id: string; createdById: string }
) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true
  if (machine.createdById === user.id) return true
  return checkPermission({
    userId: user.id,
    action: 'READ',
    resource: 'MACHINE',
    resourceId: machine.id,
  })
}

function isContainerRunning(container: { state?: string; status?: string }) {
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
