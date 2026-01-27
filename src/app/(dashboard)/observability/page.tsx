'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Button, Card, Badge, Input, ConfirmDialog } from '@/components/ui'
import { Copy, Activity, CheckCircle, AlertCircle, Terminal, RefreshCw, Eye, Trash2, RotateCcw } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import Link from 'next/link'
import { useLocale } from '@/components/providers/LocaleProvider'
import { localeTag } from '@/lib/i18n/locales'

interface Telemetry {
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

interface Machine {
  id: string
  hostname: string
  ip: string | null
  hasTelemetryToken: boolean
  telemetryEnabled: boolean
  telemetryIntervalMin: number
  telemetryInstalledAt: string | null
  lastTelemetryAt: string | null
  hasSshAccess: boolean
  sshPort: number
  latestTelemetry: Telemetry | null
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

const AUTO_REFRESH_INTERVAL = 30000 // 30 segundos

export default function ObservabilityPage() {
  const toast = useToast()
  const { t, locale } = useLocale()
  const dateLocale = localeTag(locale)
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, string>>({})
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: 'reinstall' | 'uninstall' | null
    machineId: string
    hasSshAccess: boolean
    isLoading: boolean
  }>({ open: false, action: null, machineId: '', hasSshAccess: false, isLoading: false })

  useEffect(() => {
    const origin = window.location.origin
    setBaseUrl(origin)

    const loadBaseUrl = async () => {
      try {
        const res = await fetch('/api/system/public-base-url')
        if (!res.ok) return
        const data = await res.json()
        const normalized = normalizeBaseUrl(data.publicBaseUrl || '')
        if (normalized) {
          setBaseUrl(normalized)
        }
      } catch (error) {
        console.error('Failed to load public base url:', error)
      }
    }

    loadBaseUrl()
  }, [])

  const fetchMachines = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true)
    try {
      const res = await fetch('/api/observability')
      const data = await res.json()
      setMachines(data.data || [])
    } catch (error) {
      console.error('Failed to fetch observability data:', error)
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [])

  // Fetch inicial
  useEffect(() => {
    fetchMachines(true)
  }, [fetchMachines])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchMachines(false)
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [autoRefresh, fetchMachines])

  const filteredMachines = useMemo(() => {
    if (!search) return machines
    return machines.filter((machine) =>
      machine.hostname.toLowerCase().includes(search.toLowerCase()) ||
      (machine.ip || '').includes(search)
    )
  }, [machines, search])

  const generateToken = async (machineId: string) => {
    try {
      const res = await fetch(`/api/machines/${machineId}/telemetry-token`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.telemetryToken) {
          setTokenOverrides((prev) => ({ ...prev, [machineId]: data.telemetryToken }))
        }
        toast.success(t('observability.tokenSuccess'))
        fetchMachines(false)
      } else {
        const error = await res.json()
        toast.error(error.error || t('observability.tokenError'))
      }
    } catch (error) {
      console.error('Failed to generate token:', error)
    }
  }

  const installAgent = async (machineId: string) => {
    try {
      const res = await fetch(`/api/machines/${machineId}/install-agent`, { method: 'POST' })
      if (res.ok) {
        toast.success(t('observability.installSuccess'))
        fetchMachines(false)
      } else {
        const error = await res.json()
        toast.error(error.error || t('observability.installError'))
      }
    } catch (error) {
      console.error('Failed to install agent:', error)
      toast.error(t('observability.installError'))
    }
  }

  const openUninstallDialog = (machineId: string) => {
    setConfirmDialog({
      open: true,
      action: 'uninstall',
      machineId,
      hasSshAccess: false,
      isLoading: false,
    })
  }

  const openReinstallDialog = (machineId: string, hasSshAccess: boolean) => {
    setConfirmDialog({
      open: true,
      action: 'reinstall',
      machineId,
      hasSshAccess,
      isLoading: false,
    })
  }

  const uninstallAgent = (machineId: string) => {
    openUninstallDialog(machineId)
  }

  const reinstallAgent = (machineId: string, hasSshAccess: boolean) => {
    openReinstallDialog(machineId, hasSshAccess)
  }

  const closeConfirmDialog = () => {
    setConfirmDialog((prev) => ({ ...prev, open: false, isLoading: false }))
  }

  const handleConfirmAction = async () => {
    const { action, machineId, hasSshAccess } = confirmDialog
    setConfirmDialog((prev) => ({ ...prev, isLoading: true }))

    try {
      if (action === 'uninstall') {
        const res = await fetch(`/api/machines/${machineId}/uninstall-agent`, { method: 'POST' })
        if (res.ok) {
          toast.success(t('observability.uninstallSuccess'))
          fetchMachines(false)
        } else {
          const error = await res.json()
          toast.error(error.error || t('observability.uninstallError'))
        }
      } else if (action === 'reinstall') {
        if (hasSshAccess) {
          const res = await fetch(`/api/machines/${machineId}/install-agent?force=true`, { method: 'POST' })
          if (res.ok) {
            toast.success(t('observability.reinstallSuccess'))
            fetchMachines(false)
          } else {
            const error = await res.json()
            toast.error(error.error || t('observability.reinstallError'))
          }
        } else {
          setTokenOverrides((prev) => {
            const copy = { ...prev }
            delete copy[machineId]
            return copy
          })
          await generateToken(machineId)
          toast.info(t('observability.newTokenInfo'))
        }
      }
    } catch (error) {
      console.error('Failed to perform action:', error)
      toast.error(t('observability.actionError'))
    } finally {
      closeConfirmDialog()
    }
  }

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(t('observability.commandCopied'))
    } catch {
      toast.error(t('observability.copyError'))
    }
  }

  const buildInstallCommand = (machine: Machine) => {
    const resolvedBaseUrl = baseUrl || window.location.origin
    const apiUrl = `${resolvedBaseUrl}/api/telemetry`
    const downloadUrl = `${resolvedBaseUrl}/agent/vaultrix-agent-linux-amd64`
    const interval = machine.telemetryIntervalMin || 1
    const token = tokenOverrides[machine.id]
    if (!token) {
      return t('observability.generateCommandHint')
    }
    return `curl -sSL ${downloadUrl} -o /tmp/vaultrix-agent && chmod +x /tmp/vaultrix-agent && sudo /tmp/vaultrix-agent --install --token=${token} --api-url=${apiUrl} --interval=${interval}`
  }

  const isOnline = (machine: Machine) => {
    if (!machine.lastTelemetryAt) return false
    const intervalMin = Math.max(machine.telemetryIntervalMin || 1, 1)
    const thresholdMs = intervalMin * 5 * 60 * 1000
    const last = new Date(machine.lastTelemetryAt).getTime()
    return Date.now() - last < thresholdMs
  }

  const isInstalled = (machine: Machine) => {
    return machine.telemetryInstalledAt !== null || machine.lastTelemetryAt !== null
  }

  const formatMemory = (mb: number | null) => {
    if (mb === null) return '--'
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${mb} MB`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('observability.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('observability.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-dark-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-dark-300"
            />
            {t('observability.autoRefresh')}
          </label>
          {!autoRefresh && (
            <Button variant="secondary" onClick={() => fetchMachines(true)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t('observability.update')}
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Input
          placeholder={t('observability.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center text-dark-500">{t('observability.loading')}</div>
      ) : filteredMachines.length === 0 ? (
        <Card className="p-8 text-center">
          <Activity className="mx-auto h-12 w-12 text-dark-300" />
          <p className="mt-4 text-dark-500">{t('observability.empty')}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMachines.map((machine) => {
            const online = isOnline(machine)
            const installed = isInstalled(machine)
            const telemetry = machine.latestTelemetry
            return (
              <Card key={machine.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{machine.hostname}</h3>
                      {online ? (
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
                    <p className="text-sm text-dark-500">{machine.ip || t('observability.ipMissing')}</p>
                    <p className="mt-1 text-xs text-dark-500">
                      {t('observability.lastCollection', {
                        time: machine.lastTelemetryAt
                          ? new Date(machine.lastTelemetryAt).toLocaleString(dateLocale)
                          : t('observability.never'),
                      })}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="rounded-lg bg-dark-50 px-4 py-2 text-sm text-dark-600 dark:bg-dark-800/50 dark:text-dark-300">
                      {t('observability.metrics.cpu')}: {telemetry?.cpuUsage?.toFixed(1) ?? '--'}%
                    </div>
                    <div className="rounded-lg bg-dark-50 px-4 py-2 text-sm text-dark-600 dark:bg-dark-800/50 dark:text-dark-300">
                      {t('observability.metrics.memoryAvailable')}: {formatMemory(telemetry?.memoryAvailMb ?? null)}
                    </div>
                    <div className="rounded-lg bg-dark-50 px-4 py-2 text-sm text-dark-600 dark:bg-dark-800/50 dark:text-dark-300">
                      {t('observability.metrics.disk')}: {telemetry?.diskPercent?.toFixed(0) ?? '--'}%
                    </div>
                    <div className="rounded-lg bg-dark-50 px-4 py-2 text-sm text-dark-600 dark:bg-dark-800/50 dark:text-dark-300">
                      {t('observability.metrics.containers')}: {telemetry?.containers
                        ? `${telemetry.containers.filter(c => c.state === 'running').length}/${telemetry.containers.length}`
                        : '0/0'}
                    </div>
                  </div>
                </div>

                {/* Se instalado: mostrar botões de ação e link para detalhes */}
                {installed ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                    <div className="flex items-center gap-4">
                      <Link href={`/observability/${machine.id}`}>
                        <Button size="sm" variant="default">
                          <Eye className="mr-2 h-4 w-4" />
                          {t('observability.viewDetails')}
                        </Button>
                      </Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => reinstallAgent(machine.id, machine.hasSshAccess)}
                        title={t('observability.confirmReinstallTitle')}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('observability.reinstall')}
                      </Button>
                      {machine.hasSshAccess && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => uninstallAgent(machine.id)}
                          title={t('observability.confirmRemoveTitle')}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('observability.remove')}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Se não instalado: mostrar instruções de instalação */
                  <div className="mt-4 rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Terminal className="h-4 w-4 text-primary-500" />
                        {t('observability.installOneLiner')}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {machine.hasSshAccess && machine.ip && (
                          <Button size="sm" onClick={() => installAgent(machine.id)}>
                            {t('observability.installAgent')}
                          </Button>
                        )}
                        {!tokenOverrides[machine.id] ? (
                          <Button size="sm" variant="secondary" onClick={() => generateToken(machine.id)}>
                            {t('observability.generateToken')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => copyToClipboard(buildInstallCommand(machine))}>
                            <Copy className="mr-2 h-4 w-4" />
                            {t('observability.copyCommand')}
                          </Button>
                        )}
                      </div>
                    </div>

                    {tokenOverrides[machine.id] && (
                      <pre className="mt-3 overflow-x-auto rounded-lg bg-dark-50 p-3 text-xs text-dark-600 dark:bg-dark-900 dark:text-dark-300">
                        {buildInstallCommand(machine)}
                      </pre>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        onConfirm={handleConfirmAction}
        title={confirmDialog.action === 'uninstall' ? t('observability.confirmRemoveTitle') : t('observability.confirmReinstallTitle')}
        message={
          confirmDialog.action === 'uninstall'
            ? t('observability.confirmRemoveMessage')
            : t('observability.confirmReinstallMessage')
        }
        confirmText={confirmDialog.action === 'uninstall' ? t('observability.confirmRemove') : t('observability.confirmReinstall')}
        variant={confirmDialog.action === 'uninstall' ? 'danger' : 'default'}
        isLoading={confirmDialog.isLoading}
      />
    </div>
  )
}
