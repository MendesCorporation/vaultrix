'use client'

import { useEffect, useState } from 'react'
import { Card, Badge, Button } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useLocale } from '@/components/providers/LocaleProvider'
import { useToast } from '@/components/providers/ToastProvider'
import { localeTag } from '@/lib/i18n/locales'
import {
  ScrollText,
  User,
  Key,
  Server,
  Cloud,
  Shield,
  ShieldCheck,
  ShieldOff,
  LogIn,
  LogOut,
  Eye,
  Copy,
  Plus,
  Edit,
  Trash2,
  Download,
  Layers,
  Terminal,
  Users,
  Bell,
  Loader2
} from 'lucide-react'

interface AuditLog {
  id: string
  action: string
  resourceType: string | null
  resourceId: string | null
  resourceName: string | null
  ipAddress: string
  userAgent: string | null
  timestamp: string
  user: { id: string; name: string; email: string } | null
  metadata: any
}

interface UserOption {
  id: string
  name: string
  email: string
}

export default function AuditPage() {
  const { t, locale } = useLocale()
  const toast = useToast()
  const dateLocale = localeTag(locale)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportPeriod, setExportPeriod] = useState<'today' | '7days' | '30days'>('today')
  const [isExporting, setIsExporting] = useState(false)
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    userId: '',
    search: '',
  })

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.resourceType && { resourceType: filters.resourceType }),
        ...(filters.userId && { userId: filters.userId }),
      })

      const res = await fetch(`/api/audit?${params}`)
      const data = await res.json()
      setLogs(data.data || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.data || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, filters])

  useEffect(() => {
    fetchUsers()
  }, [])

  const actionOptions = [
    { value: '', label: t('audit.actionsAll') },
    { value: 'CREATE', label: t('audit.actionLabels.CREATE') },
    { value: 'UPDATE', label: t('audit.actionLabels.UPDATE') },
    { value: 'DELETE', label: t('audit.actionLabels.DELETE') },
    { value: 'LOGIN', label: t('audit.actionLabels.LOGIN') },
    { value: 'LOGOUT', label: t('audit.actionLabels.LOGOUT') },
    { value: 'LOGIN_FAILED', label: t('audit.actionLabels.LOGIN_FAILED') },
    { value: 'MFA_ENABLED', label: t('audit.actionLabels.MFA_ENABLED') },
    { value: 'PASSWORD_CHANGE', label: t('audit.actionLabels.PASSWORD_CHANGE') },
    { value: 'SECRET_VIEWED', label: t('audit.actionLabels.SECRET_VIEWED') },
    { value: 'SECRET_COPIED', label: t('audit.actionLabels.SECRET_COPIED') },
    { value: 'PERMISSION_GRANTED', label: t('audit.actionLabels.PERMISSION_GRANTED') },
    { value: 'PERMISSION_REVOKED', label: t('audit.actionLabels.PERMISSION_REVOKED') },
  ]

  const resourceOptions = [
    { value: '', label: t('audit.resourcesAll') },
    { value: 'MACHINE', label: t('audit.resourceLabels.MACHINE') },
    { value: 'CREDENTIAL', label: t('audit.resourceLabels.CREDENTIAL') },
    { value: 'PLATFORM', label: t('audit.resourceLabels.PLATFORM') },
    { value: 'STACK', label: t('audit.resourceLabels.STACK') },
    { value: 'USER', label: t('audit.resourceLabels.USER') },
    { value: 'GROUP', label: t('audit.resourceLabels.GROUP') },
    { value: 'ALERT', label: t('audit.resourceLabels.ALERT') },
  ]

  const userOptions = [
    { value: '', label: t('audit.usersAll') },
    ...users.map((user) => ({
      value: user.id,
      label: `${user.name} (${user.email})`,
    })),
  ]

  const getActionIcon = (log: AuditLog) => {
    switch (log.action) {
      case 'SECRET_COPIED':
        return <Copy className="h-4 w-4 text-yellow-500" />
      case 'CREATE':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'UPDATE':
        if (log.metadata?.event === 'AGENT_INSTALLED') {
          return <Terminal className="h-4 w-4 text-green-500" />
        }
        if (log.metadata?.event === 'AGENT_UNINSTALLED') {
          return <Trash2 className="h-4 w-4 text-red-500" />
        }
        return <Edit className="h-4 w-4 text-blue-500" />
      case 'DELETE':
        return <Trash2 className="h-4 w-4 text-red-500" />
      case 'PERMISSION_GRANTED':
        return <ShieldCheck className="h-4 w-4 text-green-500" />
      case 'PERMISSION_REVOKED':
        return <ShieldOff className="h-4 w-4 text-red-500" />
      case 'LOGIN':
        return <LogIn className="h-4 w-4 text-green-500" />
      case 'LOGOUT':
        return <LogOut className="h-4 w-4 text-gray-500" />
      case 'LOGIN_FAILED':
        return <Shield className="h-4 w-4 text-red-500" />
      case 'MFA_ENABLED':
        return <ShieldCheck className="h-4 w-4 text-green-500" />
      case 'SECRET_VIEWED':
        return <Eye className="h-4 w-4 text-yellow-500" />
      default:
        return <ScrollText className="h-4 w-4 text-gray-500" />
    }
  }

  const getResourceIcon = (resourceType: string | null) => {
    switch (resourceType) {
      case 'MACHINE':
        return <Server className="h-4 w-4" />
      case 'CREDENTIAL':
        return <Key className="h-4 w-4" />
      case 'PLATFORM':
        return <Cloud className="h-4 w-4" />
      case 'STACK':
        return <Layers className="h-4 w-4" />
      case 'USER':
        return <User className="h-4 w-4" />
      case 'GROUP':
        return <Users className="h-4 w-4" />
      case 'ALERT':
        return <Bell className="h-4 w-4" />
      default:
        return <ScrollText className="h-4 w-4" />
    }
  }

  const getActionLabel = (log: AuditLog) => {
    const action = log.action
    const field = log.metadata?.field
    const event = log.metadata?.event
    const labels: Record<string, string> = {
      CREATE: t('audit.actionLabels.CREATE'),
      UPDATE: t('audit.actionLabels.UPDATE'),
      DELETE: t('audit.actionLabels.DELETE'),
      LOGIN: t('audit.actionLabels.LOGIN'),
      LOGOUT: t('audit.actionLabels.LOGOUT'),
      LOGIN_FAILED: t('audit.actionLabels.LOGIN_FAILED'),
      MFA_ENABLED: t('audit.actionLabels.MFA_ENABLED'),
      SECRET_VIEWED: t('audit.actionLabels.SECRET_VIEWED'),
      SECRET_COPIED: t('audit.actionLabels.SECRET_COPIED'),
      PASSWORD_CHANGE: t('audit.actionLabels.PASSWORD_CHANGE'),
      PERMISSION_GRANTED: t('audit.actionLabels.PERMISSION_GRANTED'),
      PERMISSION_REVOKED: t('audit.actionLabels.PERMISSION_REVOKED'),
    }

    if (action === 'UPDATE' && event === 'AGENT_INSTALLED') {
      return t('audit.actionLabels.AGENT_INSTALLED')
    }
    if (action === 'UPDATE' && event === 'AGENT_UNINSTALLED') {
      return t('audit.actionLabels.AGENT_UNINSTALLED')
    }

    if (action === 'SECRET_COPIED') {
      if (field === 'username') return t('audit.actionLabels.COPY_USERNAME')
      if (field === 'sshKey') return t('audit.actionLabels.COPY_SSH')
      if (field === 'password') return t('audit.actionLabels.SECRET_COPIED')
      return t('audit.actionLabels.COPY_SECRET')
    }

    if (action === 'SECRET_VIEWED') {
      if (field === 'sshKey') return t('audit.actionLabels.VIEW_SSH')
      if (field === 'password') return t('audit.actionLabels.SECRET_VIEWED')
    }

    return labels[action] || action
  }

  const getActionBadgeVariant = (log: AuditLog): 'default' | 'success' | 'warning' | 'destructive' | 'secondary' => {
    switch (log.action) {
      case 'CREATE':
      case 'LOGIN':
        return 'success'
      case 'UPDATE':
        if (log.metadata?.event === 'AGENT_INSTALLED') return 'success'
        if (log.metadata?.event === 'AGENT_UNINSTALLED') return 'destructive'
        return 'default'
      case 'DELETE':
      case 'LOGIN_FAILED':
        return 'destructive'
      case 'MFA_ENABLED':
        return 'success'
      case 'SECRET_VIEWED':
      case 'SECRET_COPIED':
        return 'warning'
      case 'PERMISSION_GRANTED':
        return 'default'
      case 'PERMISSION_REVOKED':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  const getMetadataLabel = (log: AuditLog) => {
    if (!log.metadata) return ''

    if (log.action === 'LOGIN_FAILED' && log.metadata.reason) {
      const reasonLabels: Record<string, string> = {
        mfa_invalid: t('audit.metadata.mfaInvalid'),
        invalid_password: t('audit.metadata.invalidPassword'),
        user_not_found: t('audit.metadata.userNotFound'),
        user_inactive: t('audit.metadata.userInactive'),
        rate_limit_exceeded: t('audit.metadata.rateLimitExceeded'),
      }
      return reasonLabels[log.metadata.reason] || log.metadata.reason
    }

    if (log.action === 'PERMISSION_GRANTED' || log.action === 'PERMISSION_REVOKED') {
      const target = log.metadata.targetName || log.metadata.targetId
      const actions = Array.isArray(log.metadata.actions) ? log.metadata.actions.join(', ') : ''
      return `${target ? `${t('audit.metadata.target')}: ${target}` : ''}${actions ? ` | ${t('audit.metadata.actions')}: ${actions}` : ''}`.trim()
    }

    if (log.action === 'SECRET_COPIED' || log.action === 'SECRET_VIEWED') {
      if (log.metadata.field === 'username') return t('audit.metadata.fieldUsername')
      if (log.metadata.field === 'password') return t('audit.metadata.fieldPassword')
      if (log.metadata.field === 'sshKey') return t('audit.metadata.fieldSsh')
    }

    if (log.action === 'UPDATE' && log.metadata.event === 'AGENT_INSTALLED') {
      return log.metadata.interval
        ? `${t('audit.metadata.interval')}: ${log.metadata.interval} min`
        : t('audit.metadata.agentInstalled')
    }

    if (log.action === 'UPDATE' && log.metadata.event === 'AGENT_UNINSTALLED') {
      return t('audit.metadata.agentRemoved')
    }

    return ''
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const now = new Date()
      let startDate = new Date()
      
      switch (exportPeriod) {
        case 'today':
          startDate.setHours(0, 0, 0, 0)
          break
        case '7days':
          startDate.setDate(now.getDate() - 7)
          break
        case '30days':
          startDate.setDate(now.getDate() - 30)
          break
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.resourceType && { resourceType: filters.resourceType }),
        ...(filters.userId && { userId: filters.userId }),
      })

      const res = await fetch(`/api/audit/export?${params}`)
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-${exportPeriod}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      setIsExportModalOpen(false)
    } catch (error) {
      console.error('Failed to export audit logs:', error)
      toast.error(t('audit.exportError'))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('audit.subtitle')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setIsExportModalOpen(true)}>
          <Download className="mr-2 h-4 w-4" />
          {t('audit.export')}
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-4">
          <div className="w-52">
            <Select
              options={actionOptions}
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              placeholder={t('audit.filterAction')}
            />
          </div>
          <div className="w-52">
            <Select
              options={resourceOptions}
              value={filters.resourceType}
              onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
              placeholder={t('audit.filterResource')}
            />
          </div>
          <div className="min-w-[240px] flex-1">
            <Select
              options={userOptions}
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              placeholder={t('audit.filterUser')}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="divide-y divide-dark-200 dark:divide-dark-700">
          {isLoading ? (
            <div className="p-8 text-center text-dark-500">{t('audit.loading')}</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-dark-500">
              {t('audit.empty')}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-4 p-4 hover:bg-dark-50 dark:hover:bg-dark-800/50">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-dark-100 dark:bg-dark-700">
                  {getActionIcon(log)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {log.user?.name || t('common.system')}
                    </span>
                    <Badge variant={getActionBadgeVariant(log)}>
                      {getActionLabel(log)}
                    </Badge>
                    {log.resourceType && (
                      <span className="flex items-center gap-1 text-dark-500">
                        {getResourceIcon(log.resourceType)}
                        {log.resourceName || log.resourceType}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-dark-500">
                    <span>{new Date(log.timestamp).toLocaleString(dateLocale)}</span>
                    <span>{t('audit.ipLabel')}: {log.ipAddress}</span>
                    {getMetadataLabel(log) && <span>{getMetadataLabel(log)}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-dark-200 p-4 dark:border-dark-700">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              {t('common.previous')}
            </Button>
            <span className="text-sm text-dark-500">
              {t('audit.pagination', { page, totalPages })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >
              {t('common.next')}
            </Button>
          </div>
        )}
      </Card>

      {/* Modal de Exportação */}
      <Modal open={isExportModalOpen} onClose={() => setIsExportModalOpen(false)}>
        <ModalHeader onClose={() => setIsExportModalOpen(false)}>
          {t('audit.exportTitle')}
        </ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            <p className="text-sm text-dark-500">{t('audit.exportDescription')}</p>
            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('audit.exportPeriod')}</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="today"
                    checked={exportPeriod === 'today'}
                    onChange={(e) => setExportPeriod(e.target.value as 'today' | '7days' | '30days')}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-500"
                  />
                  <span>{t('audit.periodToday')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="7days"
                    checked={exportPeriod === '7days'}
                    onChange={(e) => setExportPeriod(e.target.value as 'today' | '7days' | '30days')}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-500"
                  />
                  <span>{t('audit.period7Days')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="period"
                    value="30days"
                    checked={exportPeriod === '30days'}
                    onChange={(e) => setExportPeriod(e.target.value as 'today' | '7days' | '30days')}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-500"
                  />
                  <span>{t('audit.period30Days')}</span>
                </label>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsExportModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('audit.exporting')}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t('audit.export')}
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
