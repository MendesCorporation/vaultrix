'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type MouseEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Badge } from '@/components/ui'
import {
  ArrowLeft,
  RefreshCw,
  Cpu,
  HardDrive,
  Activity,
  Box,
  CheckCircle,
  AlertCircle,
  Server,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import Link from 'next/link'
import { useLocale } from '@/components/providers/LocaleProvider'
import { localeTag } from '@/lib/i18n/locales'

interface TelemetryData {
  id: string
  cpuUsage: number | null
  cpuCores: number | null
  memoryTotalMb: number | null
  memoryAvailMb: number | null
  memoryUsedMb: number | null
  memoryPercent: number | null
  diskTotalGb: number | null
  diskUsedGb: number | null
  diskPercent: number | null
  loadAvg1: number | null
  loadAvg5: number | null
  loadAvg15: number | null
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
  createdAt: string
}

interface MachineData {
  id: string
  hostname: string
  ip: string | null
  os: string | null
  osVersion: string | null
  specs: Record<string, unknown> | null
  telemetryEnabled: boolean
  telemetryIntervalMin: number
  telemetryInstalledAt: string | null
  lastTelemetryAt: string | null
  hasSshAccess: boolean
  sshPort: number
}

interface ApiResponse {
  machine: MachineData
  latestTelemetry: TelemetryData | null
  history: TelemetryData[]
}

const AUTO_REFRESH_INTERVAL = 30000
const CHART_HEIGHT = 170
const CHART_WIDTH = 600

function MiniChart({
  data,
  color,
  maxValue = 100,
  label,
}: {
  data: Array<{ value: number; timestamp: string }>
  color: string
  maxValue?: number
  label: string
}) {
  const { t, locale } = useLocale()
  const dateLocale = localeTag(locale)
  if (data.length < 2) {
    return (
      <div className="flex h-[170px] items-center justify-center text-base text-dark-400">
        {t('observabilityDetail.waitingData')}
      </div>
    )
  }

  const width = CHART_WIDTH
  const height = CHART_HEIGHT
  const padding = { top: 10, right: 10, bottom: 20, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const normalizedData = data.map((point) => Math.min(point.value, maxValue))
  const points = normalizedData.map((value, index) => {
    const x = padding.left + (index / (normalizedData.length - 1)) * chartWidth
    const y = padding.top + chartHeight - (value / maxValue) * chartHeight
    return `${x},${y}`
  })

  const areaPoints = [
    `${padding.left},${padding.top + chartHeight}`,
    ...points,
    `${padding.left + chartWidth},${padding.top + chartHeight}`,
  ].join(' ')

  const gridLines = [0, 25, 50, 75, 100].map((pct) => {
    const y = padding.top + chartHeight - (pct / 100) * chartHeight
    return { y, label: `${Math.round((pct / 100) * maxValue)}` }
  })

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    const relativeX = (event.clientX - rect.left) / rect.width
    const x = relativeX * width
    const clampedX = Math.min(Math.max(x, padding.left), width - padding.right)
    const ratio = (clampedX - padding.left) / chartWidth
    const index = Math.round(ratio * (normalizedData.length - 1))
    setHoverIndex(index)
  }

  const handleMouseLeave = () => {
    setHoverIndex(null)
  }

  const hoverPoint = hoverIndex !== null
    ? (() => {
        const value = normalizedData[hoverIndex]
        const raw = data[hoverIndex]?.value ?? 0
        const timestamp = data[hoverIndex]?.timestamp
        const x = padding.left + (hoverIndex / (normalizedData.length - 1)) * chartWidth
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight
        return { x, y, raw, timestamp }
      })()
    : null

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[170px] w-full"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid lines */}
        {gridLines.map((line, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={line.y}
              x2={width - padding.right}
              y2={line.y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="2,2"
            />
            <text
              x={padding.left - 5}
              y={line.y + 5}
              textAnchor="end"
              className="fill-current text-[16px] text-dark-400"
            >
              {line.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <polygon points={areaPoints} fill={color} fillOpacity={0.1} />

        {/* Line */}
        <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} />

        {/* Latest value dot */}
        {points.length > 0 && (
          <circle
            cx={parseFloat(points[points.length - 1].split(',')[0])}
            cy={parseFloat(points[points.length - 1].split(',')[1])}
            r={4}
            fill={color}
          />
        )}

        {hoverPoint && (
          <g>
            <line
              x1={hoverPoint.x}
              y1={padding.top}
              x2={hoverPoint.x}
              y2={padding.top + chartHeight}
              stroke="currentColor"
              strokeOpacity={0.15}
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill={color} />
            {(() => {
              const valueText = `${hoverPoint.raw.toFixed(1)}`
              const dateText = hoverPoint.timestamp
                ? new Date(hoverPoint.timestamp).toLocaleString(dateLocale)
                : ''
              const tooltipWidth = 200
              const tooltipHeight = 50
              const tooltipX =
                hoverPoint.x + 8 + tooltipWidth > width
                  ? hoverPoint.x - tooltipWidth - 8
                  : hoverPoint.x + 8
              const tooltipY = Math.max(padding.top, hoverPoint.y - tooltipHeight - 8)
              return (
                <g>
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx={6}
                    className="fill-white stroke-dark-200 dark:fill-dark-800 dark:stroke-dark-700"
                  />
                  <text
                    x={tooltipX + 8}
                    y={tooltipY + 18}
                    className="fill-current text-[16px] font-medium text-dark-700 dark:text-dark-200"
                  >
                    {valueText}%
                  </text>
                  <text
                    x={tooltipX + 8}
                    y={tooltipY + 36}
                    className="fill-current text-[14px] text-dark-500"
                  >
                    {dateText}
                  </text>
                </g>
              )
            })()}
          </g>
        )}

        {/* Label */}
        <text x={width / 2} y={height - 2} textAnchor="middle" className="fill-current text-[16px] text-dark-500">
          {label}
        </text>
      </svg>
    </div>
  )
}

function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  value: string
  subtitle?: string
  color: string
}) {
  return (
    <div className="rounded-lg border border-dark-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-dark-500">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-dark-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-dark-200 dark:bg-dark-700">
      <div
        className={`h-full rounded-full transition-all duration-300 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

function getStackName(containerName: string): string {
  // Docker Compose naming: stackname_servicename_1 or stackname-servicename-1
  const parts = containerName.split(/[-_]/)
  if (parts.length >= 2) {
    return parts[0]
  }
  return 'standalone'
}

export default function MachineDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const { t, locale } = useLocale()
  const dateLocale = localeTag(locale)
  const machineId = params.id as string

  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [hours, setHours] = useState(24)
  const [expandedStacks, setExpandedStacks] = useState<Set<string>>(new Set())

  const toggleStack = (stackName: string) => {
    setExpandedStacks((prev) => {
      const next = new Set(prev)
      if (next.has(stackName)) {
        next.delete(stackName)
      } else {
        next.add(stackName)
      }
      return next
    })
  }

  // Use refs to avoid re-creating fetchData on every render
  const toastRef = useRef(toast)
  const routerRef = useRef(router)
  toastRef.current = toast
  routerRef.current = router

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true)
      try {
        const res = await fetch(`/api/observability/${machineId}?hours=${hours}`)
        if (!res.ok) {
          if (res.status === 404) {
            toastRef.current.error(t('observabilityDetail.notFound'))
            routerRef.current.push('/observability')
            return
          }
          throw new Error('Failed to fetch')
        }
        const result = await res.json()
        setData(result)
      } catch (error) {
        console.error('Failed to fetch machine data:', error)
        toastRef.current.error(t('observabilityDetail.loadError'))
      } finally {
        if (showLoading) setIsLoading(false)
      }
    },
    [machineId, hours]
  )

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => fetchData(false), AUTO_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const isOnline = useMemo(() => {
    if (!data?.machine?.lastTelemetryAt) return false
    const last = new Date(data.machine.lastTelemetryAt).getTime()
    const intervalMin = Math.max(data.machine.telemetryIntervalMin || 1, 1)
    const thresholdMs = intervalMin * 5 * 60 * 1000
    return Date.now() - last < thresholdMs
  }, [data])

  const cpuHistory = useMemo(() => {
    return (data?.history || []).map((h) => ({
      value: h.cpuUsage ?? 0,
      timestamp: h.createdAt,
    }))
  }, [data])

  const memoryHistory = useMemo(() => {
    return (data?.history || []).map((h) => ({
      value: h.memoryPercent ?? 0,
      timestamp: h.createdAt,
    }))
  }, [data])

  const diskHistory = useMemo(() => {
    return (data?.history || []).map((h) => ({
      value: h.diskPercent ?? 0,
      timestamp: h.createdAt,
    }))
  }, [data])

  const containersByStack = useMemo(() => {
    const containers = data?.latestTelemetry?.containers || []
    const grouped: Record<string, typeof containers> = {}

    containers.forEach((container) => {
      const stack = getStackName(container.name)
      if (!grouped[stack]) {
        grouped[stack] = []
      }
      grouped[stack].push(container)
    })

    return grouped
  }, [data])

  const formatMemory = (mb: number | null) => {
    if (mb === null) return '--'
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
  }

  const formatDisk = (gb: number | null) => {
    if (gb === null) return '--'
    return `${gb.toFixed(1)} GB`
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center">
        <p className="text-dark-500">{t('observabilityDetail.loadError')}</p>
        <Button className="mt-4" onClick={() => router.push('/observability')}>
          {t('observabilityDetail.back')}
        </Button>
      </div>
    )
  }

  const { machine, latestTelemetry } = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/observability">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('observabilityDetail.back')}
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{machine.hostname}</h1>
              {isOnline ? (
                <Badge variant="success" className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t('common.online')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {t('common.offline')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-dark-500">
              {machine.ip || t('observabilityDetail.ipMissing')}
              {machine.os && ` • ${machine.os} ${machine.osVersion || ''}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="min-w-[160px] rounded-lg border border-dark-200 bg-white px-3 py-2 pr-8 text-sm dark:border-dark-700 dark:bg-dark-800"
          >
            <option value={1}>{t('observabilityDetail.lastHour')}</option>
            <option value={6}>{t('observabilityDetail.lastHours', { hours: 6 })}</option>
            <option value={24}>{t('observabilityDetail.last24Hours')}</option>
            <option value={48}>{t('observabilityDetail.last48Hours')}</option>
            <option value={168}>{t('observabilityDetail.lastWeek')}</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-dark-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-dark-300"
            />
            {t('observabilityDetail.autoRefresh')}
          </label>

          {!autoRefresh && (
            <Button variant="secondary" onClick={() => fetchData(true)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t('observabilityDetail.update')}
            </Button>
          )}
        </div>
      </div>

      {machine.lastTelemetryAt && (
        <p className="text-xs text-dark-400">
          {t('observabilityDetail.lastCollection', { time: new Date(machine.lastTelemetryAt).toLocaleString(dateLocale) })}
        </p>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Cpu}
          title={t('observabilityDetail.cpu')}
          value={`${latestTelemetry?.cpuUsage?.toFixed(1) ?? '--'}%`}
          subtitle={`${latestTelemetry?.cpuCores ?? '--'} ${t('observabilityDetail.cores')}`}
          color="bg-blue-500"
        />
        <StatCard
          icon={Server}
          title={t('observabilityDetail.memory')}
          value={formatMemory(latestTelemetry?.memoryUsedMb ?? null)}
          subtitle={`${t('common.of')} ${formatMemory(latestTelemetry?.memoryTotalMb ?? null)} (${latestTelemetry?.memoryPercent?.toFixed(0) ?? '--'}%)`}
          color="bg-green-500"
        />
        <StatCard
          icon={HardDrive}
          title={t('observabilityDetail.disk')}
          value={formatDisk(latestTelemetry?.diskUsedGb ?? null)}
          subtitle={`${t('common.of')} ${formatDisk(latestTelemetry?.diskTotalGb ?? null)} (${latestTelemetry?.diskPercent?.toFixed(0) ?? '--'}%)`}
          color="bg-purple-500"
        />
        <StatCard
          icon={Activity}
          title={t('observabilityDetail.loadAverage')}
          value={latestTelemetry?.loadAvg1?.toFixed(2) ?? '--'}
          subtitle={`5m: ${latestTelemetry?.loadAvg5?.toFixed(2) ?? '--'} | 15m: ${latestTelemetry?.loadAvg15?.toFixed(2) ?? '--'}`}
          color="bg-orange-500"
        />
      </div>

      {/* Resource Usage Bars */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('observabilityDetail.resourceUsage')}</h2>
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>{t('observabilityDetail.cpu')}</span>
              <span>{latestTelemetry?.cpuUsage?.toFixed(1) ?? '--'}%</span>
            </div>
            <ProgressBar
              value={latestTelemetry?.cpuUsage ?? 0}
              color={
                (latestTelemetry?.cpuUsage ?? 0) > 80
                  ? 'bg-red-500'
                  : (latestTelemetry?.cpuUsage ?? 0) > 60
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>{t('observabilityDetail.memory')} ({formatMemory(latestTelemetry?.memoryUsedMb ?? null)} {t('observabilityDetail.used')})</span>
              <span>{latestTelemetry?.memoryPercent?.toFixed(1) ?? '--'}%</span>
            </div>
            <ProgressBar
              value={latestTelemetry?.memoryPercent ?? 0}
              color={
                (latestTelemetry?.memoryPercent ?? 0) > 80
                  ? 'bg-red-500'
                  : (latestTelemetry?.memoryPercent ?? 0) > 60
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span>{t('observabilityDetail.disk')} ({formatDisk(latestTelemetry?.diskUsedGb ?? null)} {t('observabilityDetail.used')})</span>
              <span>{latestTelemetry?.diskPercent?.toFixed(1) ?? '--'}%</span>
            </div>
            <ProgressBar
              value={latestTelemetry?.diskPercent ?? 0}
              color={
                (latestTelemetry?.diskPercent ?? 0) > 80
                  ? 'bg-red-500'
                  : (latestTelemetry?.diskPercent ?? 0) > 60
                    ? 'bg-yellow-500'
                    : 'bg-purple-500'
              }
            />
          </div>
        </div>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-h-[240px] p-5">
          <h3 className="mb-3 text-base font-semibold">{`${t('observabilityDetail.cpu')} (%)`}</h3>
          <MiniChart data={cpuHistory} color="#3b82f6" label={t('observabilityDetail.chartsLabel', { hours })} />
        </Card>
        <Card className="min-h-[240px] p-5">
          <h3 className="mb-3 text-base font-semibold">{`${t('observabilityDetail.memory')} (%)`}</h3>
          <MiniChart data={memoryHistory} color="#22c55e" label={t('observabilityDetail.chartsLabel', { hours })} />
        </Card>
        <Card className="min-h-[240px] p-5">
          <h3 className="mb-3 text-base font-semibold">{`${t('observabilityDetail.disk')} (%)`}</h3>
          <MiniChart data={diskHistory} color="#a855f7" label={t('observabilityDetail.chartsLabel', { hours })} />
        </Card>
      </div>

      {/* Containers by Stack */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            <Box className="mr-2 inline h-5 w-5" />
            {t('observabilityDetail.containers')} ({latestTelemetry?.containers?.length || 0})
          </h2>
        </div>

        {Object.keys(containersByStack).length === 0 ? (
          <p className="text-center text-dark-500">{t('observabilityDetail.noContainers')}</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(containersByStack)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([stackName, containers]) => {
                const isExpanded = expandedStacks.has(stackName)
                const runningCount = containers.filter((c) => c.state === 'running').length
                const allRunning = runningCount === containers.length
                const totalCpu = containers.reduce((sum, c) => sum + (c.cpuPercent || 0), 0)
                const totalMemPercent = containers.reduce((sum, c) => sum + (c.memPercent || 0), 0)

                return (
                  <div key={stackName} className="rounded-lg border border-dark-200 dark:border-dark-700">
                    {/* Stack Header - Clickable */}
                    <button
                      onClick={() => toggleStack(stackName)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-dark-50 dark:hover:bg-dark-800/50"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-dark-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-dark-400" />
                        )}
                        <span className="rounded bg-dark-100 px-2 py-0.5 text-sm font-medium dark:bg-dark-700">
                          {stackName}
                        </span>
                        <span className="text-sm text-dark-400">({containers.length} {t('observabilityDetail.containers').toLowerCase()})</span>
                        <Badge variant={allRunning ? 'success' : 'secondary'}>
                          {allRunning
                            ? t('observabilityDetail.running')
                            : `${runningCount}/${containers.length} ${t('observabilityDetail.running')}`}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-dark-500">
                        <span>{t('observabilityDetail.cpu')}: {totalCpu.toFixed(1)}%</span>
                        <span>{t('observabilityDetail.memory')}: {totalMemPercent.toFixed(1)}%</span>
                      </div>
                    </button>

                    {/* Stack Content - Collapsible */}
                    {isExpanded && (
                      <div className="border-t border-dark-200 p-3 dark:border-dark-700">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-dark-200 text-left dark:border-dark-700">
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.name')}</th>
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.status')}</th>
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.cpu')}</th>
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.memory')}</th>
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.network')}</th>
                                <th className="pb-2 font-medium">{t('observabilityDetail.table.block')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {containers.map((container, idx) => (
                                <tr
                                  key={container.id || idx}
                                  className="border-b border-dark-100 last:border-b-0 dark:border-dark-800"
                                >
                                  <td className="py-2">
                                    <div>
                                      <p className="font-medium">{container.name}</p>
                                      <p className="text-xs text-dark-400">{container.image}</p>
                                    </div>
                                  </td>
                                  <td className="py-2">
                                      <Badge
                                        variant={container.state === 'running' ? 'success' : 'secondary'}
                                      >
                                        {container.state || container.status || t('common.none')}
                                      </Badge>
                                    </td>
                                  <td className="py-2">
                                    {container.cpuPercent?.toFixed(1) ?? '--'}%
                                  </td>
                                  <td className="py-2">
                                    <div>
                                      <p>{container.memUsage || '--'}</p>
                                      <p className="text-xs text-dark-400">
                                        {container.memPercent?.toFixed(1) ?? '--'}%
                                      </p>
                                    </div>
                                  </td>
                                  <td className="py-2 text-xs">{container.netIO || '--'}</td>
                                  <td className="py-2 text-xs">{container.blockIO || '--'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </Card>

      {/* Machine Info */}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">{t('observabilityDetail.machineInfo')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm text-dark-500">{t('common.hostname')}</p>
            <p className="font-medium">{machine.hostname}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.ip')}</p>
            <p className="font-medium">{machine.ip || t('observabilityDetail.ipMissing')}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.os')}</p>
            <p className="font-medium">
              {machine.os || t('observabilityDetail.osUnknown')} {machine.osVersion || ''}
            </p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.sshPort')}</p>
            <p className="font-medium">{machine.sshPort}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('observabilityDetail.telemetryInterval')}</p>
            <p className="font-medium">
              {machine.telemetryIntervalMin}{' '}
              {machine.telemetryIntervalMin === 1
                ? t('observabilityDetail.minute')
                : t('observabilityDetail.minutes')}
            </p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('observabilityDetail.telemetryInstalled')}</p>
            <p className="font-medium">
              {machine.telemetryInstalledAt
                ? new Date(machine.telemetryInstalledAt).toLocaleString(dateLocale)
                : t('observabilityDetail.telemetryNotInstalled')}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
