'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Select } from '@/components/ui/Select'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale, localeOptions } from '@/components/providers/LocaleProvider'
import { localeTag } from '@/lib/i18n/locales'
import { Shield, Mail, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, ChevronDown, Link as LinkIcon, Bell, KeyRound, Languages, Smartphone, Database, RotateCcw, Play, Clock } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import type { UserRole } from '@prisma/client'

interface SystemConfig {
  brandingLogoUrl: string
  brandingFaviconUrl: string
  publicBaseUrl: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  smtpSecure: boolean
  smtpStarttls: boolean
  setupCompleted: boolean
  mfaRequired: boolean
}

interface SettingsClientProps {
  user: {
    id: string
    name?: string | null
    email?: string | null
    role: UserRole
  }
}

interface MachineOption {
  id: string
  hostname: string
  ip?: string | null
}

interface AlertItem {
  id: string
  name: string
  machineId: string | null
  machine?: { id: string; hostname: string }
  cpuThreshold?: number | null
  memoryThreshold?: number | null
  containerDown: boolean
  machineOffline: boolean
  isActive: boolean
  createdAt: string
}

interface BackupConfig {
  id: string
  name: string
  destination: 'local' | 'remote'
  machineId: string | null
  machine?: { id: string; hostname: string; ip?: string | null }
  folder: string
  retentionDays: number
  scheduleTime: string
  scheduleDays: string[]
  isActive: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunMessage: string | null
  createdAt: string
}

interface BackupHistoryItem {
  id: string
  fileName: string
  fileSize: number | null
  destination: string
  machineId: string | null
  folder: string
  status: string
  errorMessage: string | null
  createdAt: string
}

const defaultConfig: SystemConfig = {
  brandingLogoUrl: '',
  brandingFaviconUrl: '',
  publicBaseUrl: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  smtpSecure: false,
  smtpStarttls: false,
  setupCompleted: false,
  mfaRequired: false,
}

const defaultLogoSrc = '/brand/logo.svg'
const defaultFaviconSrc = '/brand/favicon.svg'

export function SettingsClient({ user }: SettingsClientProps) {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { locale, setLocale, t } = useLocale()
  const dateLocale = localeTag(locale)
  const isSuperAdmin = user.role === 'SUPER_ADMIN'
  const [config, setConfig] = useState<SystemConfig>(defaultConfig)
  const [isSavingBranding, setIsSavingBranding] = useState(false)
  const [isSavingSmtp, setIsSavingSmtp] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [logoPreviewError, setLogoPreviewError] = useState(false)
  const [faviconPreviewError, setFaviconPreviewError] = useState(false)
  const [smtpStatus, setSmtpStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [smtpMessage, setSmtpMessage] = useState('')
  const [smtpBaseline, setSmtpBaseline] = useState('')
  const [openSections, setOpenSections] = useState({
    publicUrl: false,
    branding: false,
    smtp: false,
    password: false,
    mfa: false,
    alerts: false,
    language: false,
    backup: false,
  })
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  const [machines, setMachines] = useState<MachineOption[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [savingAlert, setSavingAlert] = useState(false)
  const [alertForm, setAlertForm] = useState({
    name: '',
    machineId: 'all',
    cpuEnabled: false,
    cpuThreshold: 80,
    memoryEnabled: false,
    memoryThreshold: 80,
    containerDown: false,
    machineOffline: false,
    isActive: true,
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingLocale, setSavingLocale] = useState(false)

  // MFA State (system-wide, Super Admin only)
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaLoading, setMfaLoading] = useState(false)

  // Backup State
  const [backupConfigs, setBackupConfigs] = useState<BackupConfig[]>([])
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [savingBackup, setSavingBackup] = useState(false)
  const [runningBackup, setRunningBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null)
  const [uploadingRestore, setUploadingRestore] = useState(false)
  const [editingConfig, setEditingConfig] = useState<string | null>(null)
  const restoreUploadRef = useRef<HTMLInputElement>(null)

  const [backupForm, setBackupForm] = useState({
    mode: 'immediate' as 'immediate' | 'scheduled',
    name: '',
    destination: 'local' as 'local' | 'remote',
    machineId: '',
    folder: '/app/storage/backups',
    retentionDays: 7,
    scheduleTime: '03:00',
    scheduleDays: [] as string[],
  })

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const buildSmtpSignature = (cfg: SystemConfig) => ([
    cfg.smtpHost,
    String(cfg.smtpPort || ''),
    cfg.smtpUser,
    cfg.smtpPass,
    cfg.smtpFrom,
    cfg.smtpSecure ? '1' : '0',
    cfg.smtpStarttls ? '1' : '0',
  ].join('|'))

  const loadSmtpStatus = async (currentConfig?: SystemConfig) => {
    try {
      const res = await fetch('/api/system/smtp/status')
      if (!res.ok) return
      const data = await res.json()

      if (data.verified) {
        setSmtpStatus('success')
        const verifiedAt = data.verifiedAt
        setSmtpMessage(
          verifiedAt
            ? t('settings.smtp.verifiedAt', { date: new Date(verifiedAt).toLocaleString(dateLocale) })
            : t('settings.smtp.success')
        )
        const signature = buildSmtpSignature(currentConfig || config)
        setSmtpBaseline(signature)
      } else {
        setSmtpStatus('idle')
        setSmtpMessage('')
        setSmtpBaseline('')
      }
    } catch (error) {
      console.error('Failed to load smtp status:', error)
    }
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/system/config')
      const data = await res.json()
      const nextConfig = { ...defaultConfig, ...data }
      setConfig(nextConfig)
      setMfaRequired(data.mfaRequired ?? false)
      await loadSmtpStatus(nextConfig)
    } catch (error) {
      console.error('Failed to fetch config:', error)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      fetchConfig()
    }
  }, [isSuperAdmin])

  useEffect(() => {
    setLogoPreviewError(false)
  }, [config.brandingLogoUrl])

  useEffect(() => {
    setFaviconPreviewError(false)
  }, [config.brandingFaviconUrl])

  useEffect(() => {
    if (!smtpBaseline) return
    const signature = buildSmtpSignature(config)
    if (signature !== smtpBaseline && smtpStatus === 'success') {
      setSmtpStatus('idle')
      setSmtpMessage('')
      setSmtpBaseline('')
    }
  }, [
    config.smtpHost,
    config.smtpPort,
    config.smtpUser,
    config.smtpPass,
    config.smtpFrom,
    config.smtpSecure,
    config.smtpStarttls,
    smtpBaseline,
    smtpStatus,
  ])

  const saveBranding = async () => {
    setIsSavingBranding(true)
    try {
      const res = await fetch('/api/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandingLogoUrl: config.brandingLogoUrl,
          brandingFaviconUrl: config.brandingFaviconUrl,
          publicBaseUrl: config.publicBaseUrl,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('common.saveError'))
      }
    } catch (error) {
      console.error('Failed to save branding:', error)
    } finally {
      setIsSavingBranding(false)
    }
  }

  const saveSmtp = async () => {
    setIsSavingSmtp(true)
    setSmtpStatus('testing')
    setSmtpMessage(t('settings.smtp.testing'))
    try {
      const res = await fetch('/api/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpUser: config.smtpUser,
          smtpPass: config.smtpPass,
          smtpFrom: config.smtpFrom,
          smtpSecure: config.smtpSecure,
          smtpStarttls: config.smtpStarttls,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.smtp.saveError'))
        setSmtpStatus('error')
        setSmtpMessage(error.error || t('settings.smtp.saveError'))
        return
      }

      const testRes = await fetch('/api/system/smtp/test', { method: 'POST' })
      const testData = await testRes.json().catch(() => ({}))

      if (!testRes.ok) {
        setSmtpStatus('error')
        const hint = config.smtpSecure
          ? t('settings.smtp.hintTls587')
          : config.smtpStarttls
            ? t('settings.smtp.hintTls465')
            : ''
        setSmtpMessage(testData.error || `${t('settings.smtp.testError')}. ${hint}`.trim())
        return
      }

      setSmtpStatus('success')
      setSmtpMessage(testData.message || t('settings.smtp.success'))
      setSmtpBaseline(buildSmtpSignature(config))
    } catch (error) {
      console.error('Failed to save smtp:', error)
      setSmtpStatus('error')
      setSmtpMessage(t('settings.smtp.testError'))
    } finally {
      setIsSavingSmtp(false)
    }
  }

  const uploadFile = async (file: File, type: 'logo' | 'favicon') => {
    const isLogo = type === 'logo'
    if (isLogo) {
      setLogoPreviewError(false)
    } else {
      setFaviconPreviewError(false)
    }
    isLogo ? setLogoUploading(true) : setFaviconUploading(true)

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch(`/api/system/${type}`, {
        method: 'POST',
        body,
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('common.uploadError'))
        return
      }

      const data = await res.json()
      setConfig((prev) => ({
        ...prev,
        ...(isLogo ? { brandingLogoUrl: data.url } : { brandingFaviconUrl: data.url }),
      }))
    } catch (error) {
      console.error('Failed to upload file:', error)
    } finally {
      isLogo ? setLogoUploading(false) : setFaviconUploading(false)
    }
  }

  const fetchMachines = async () => {
    try {
      const res = await fetch('/api/machines?limit=200')
      const data = await res.json()
      setMachines(data.data || [])
    } catch (error) {
      console.error('Failed to fetch machines:', error)
    }
  }

  const fetchAlerts = async () => {
    setAlertsLoading(true)
    try {
      const res = await fetch('/api/alerts')
      const data = await res.json()
      setAlerts(data.data || [])
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    } finally {
      setAlertsLoading(false)
    }
  }

  useEffect(() => {
    fetchMachines()
    fetchAlerts()
  }, [])

  const resetAlertForm = () => {
    setAlertForm({
      name: '',
      machineId: 'all',
      cpuEnabled: false,
      cpuThreshold: 80,
      memoryEnabled: false,
      memoryThreshold: 80,
      containerDown: false,
      machineOffline: false,
      isActive: true,
    })
  }

  const handleCreateAlert = async () => {
    if (!alertForm.name.trim()) {
      toast.error(t('settings.alerts.validation.name'))
      return
    }

    if (!alertForm.cpuEnabled && !alertForm.memoryEnabled && !alertForm.containerDown && !alertForm.machineOffline) {
      toast.error(t('settings.alerts.validation.condition'))
      return
    }

    if (alertForm.cpuEnabled && (alertForm.cpuThreshold < 1 || alertForm.cpuThreshold > 100)) {
      toast.error(t('settings.alerts.validation.cpuRange'))
      return
    }

    if (alertForm.memoryEnabled && (alertForm.memoryThreshold < 1 || alertForm.memoryThreshold > 100)) {
      toast.error(t('settings.alerts.validation.memoryRange'))
      return
    }

    setSavingAlert(true)
    try {
      const payload = {
        name: alertForm.name,
        allMachines: alertForm.machineId === 'all',
        machineId: alertForm.machineId === 'all' ? null : alertForm.machineId,
        cpuThreshold: alertForm.cpuEnabled ? alertForm.cpuThreshold : null,
        memoryThreshold: alertForm.memoryEnabled ? alertForm.memoryThreshold : null,
        containerDown: alertForm.containerDown,
        machineOffline: alertForm.machineOffline,
        isActive: alertForm.isActive,
      }

      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.alerts.toasts.createError'))
        return
      }

      toast.success(t('settings.alerts.toasts.created'))
      resetAlertForm()
      fetchAlerts()
    } catch (error) {
      console.error('Failed to create alert:', error)
      toast.error(t('settings.alerts.toasts.createError'))
    } finally {
      setSavingAlert(false)
    }
  }

  const handleToggleAlert = async (alert: AlertItem) => {
    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !alert.isActive }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.alerts.toasts.updatedError'))
        return
      }
      fetchAlerts()
    } catch (error) {
      console.error('Failed to update alert:', error)
    }
  }

  const handleDeleteAlert = async (alert: AlertItem) => {
    const accepted = await confirm({
      title: t('common.delete'),
      description: t('settings.alerts.confirmDelete', { name: alert.name }),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/alerts/${alert.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.alerts.toasts.deleteError'))
        return
      }
      toast.success(t('settings.alerts.toasts.deleted'))
      fetchAlerts()
    } catch (error) {
      console.error('Failed to delete alert:', error)
    }
  }

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error(t('settings.passwordErrors.missing'))
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error(t('settings.passwordErrors.min'))
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t('settings.passwordErrors.mismatch'))
      return
    }

    setSavingPassword(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          password: passwordForm.newPassword,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.passwordErrors.updateError'))
        return
      }

      toast.success(t('settings.passwordErrors.updated'))
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      console.error('Failed to update password:', error)
      toast.error(t('settings.passwordErrors.updateError'))
    } finally {
      setSavingPassword(false)
    }
  }

  const handleLocaleChange = async (nextLocale: string) => {
    setSavingLocale(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.languageUpdateError'))
        return
      }
      setLocale(nextLocale as any)
      toast.success(t('settings.languageUpdated'))
    } catch (error) {
      console.error('Failed to update locale:', error)
      toast.error(t('settings.languageUpdateError'))
    } finally {
      setSavingLocale(false)
    }
  }

  const handleMfaToggle = async () => {
    setMfaLoading(true)
    try {
      const res = await fetch('/api/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfaRequired: !mfaRequired,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.mfa.errors.toggleFailed'))
        return
      }

      setMfaRequired(!mfaRequired)
      toast.success(mfaRequired ? t('settings.mfa.success.disabled') : t('settings.mfa.success.enabled'))
    } catch (error) {
      console.error('Failed to toggle MFA:', error)
      toast.error(t('settings.mfa.errors.toggleFailed'))
    } finally {
      setMfaLoading(false)
    }
  }

  const buildAlertConditions = (alert: AlertItem) => {
    const conditions: string[] = []
    if (alert.cpuThreshold !== null && alert.cpuThreshold !== undefined) {
      conditions.push(t('settings.alerts.conditionCpu', { value: alert.cpuThreshold }))
    }
    if (alert.memoryThreshold !== null && alert.memoryThreshold !== undefined) {
      conditions.push(t('settings.alerts.conditionMemory', { value: alert.memoryThreshold }))
    }
    if (alert.containerDown) {
      conditions.push(t('settings.alerts.conditionContainer'))
    }
    if (alert.machineOffline) {
      conditions.push(t('settings.alerts.conditionOffline'))
    }
    return conditions
  }

  // Backup functions
  const fetchBackupConfigs = async () => {
    setBackupLoading(true)
    try {
      const res = await fetch('/api/backup/config')
      if (res.ok) {
        const data = await res.json()
        setBackupConfigs(data)
      }
    } catch (error) {
      console.error('Failed to fetch backup configs:', error)
    } finally {
      setBackupLoading(false)
    }
  }

  const fetchBackupHistory = async () => {
    try {
      const res = await fetch('/api/backup/history?limit=10')
      if (res.ok) {
        const data = await res.json()
        setBackupHistory(data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch backup history:', error)
    }
  }

  useEffect(() => {
    if (isSuperAdmin) {
      fetchBackupConfigs()
      fetchBackupHistory()
    }
  }, [isSuperAdmin])

  const resetBackupForm = () => {
    setBackupForm({
      mode: 'immediate',
      name: '',
      destination: 'local',
      machineId: '',
      folder: '/app/storage/backups',
      retentionDays: 7,
      scheduleTime: '03:00',
      scheduleDays: [],
    })
    setEditingConfig(null)
  }

  const handleEditConfig = (config: BackupConfig) => {
    setBackupForm({
      mode: 'scheduled',
      name: config.name,
      destination: config.destination,
      machineId: config.machineId || '',
      folder: config.folder,
      retentionDays: config.retentionDays,
      scheduleTime: config.scheduleTime,
      scheduleDays: config.scheduleDays,
    })
    setEditingConfig(config.id)
  }

  const handleSaveBackup = async () => {
    if (backupForm.mode === 'immediate') {
      // Executar backup imediato
      if (backupForm.destination === 'remote' && !backupForm.machineId) {
        toast.error(t('settings.backup.validation.machineRequired'))
        return
      }

      if (!backupForm.folder.trim()) {
        toast.error(t('settings.backup.validation.folderRequired'))
        return
      }

      setRunningBackup(true)
      try {
        const res = await fetch('/api/backup/run-immediate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: backupForm.destination,
            machineId: backupForm.machineId || null,
            folder: backupForm.folder,
            retentionDays: backupForm.retentionDays,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error || t('settings.backup.toasts.backupError'))
          return
        }

        toast.success(t('settings.backup.toasts.backupSuccess'))
        fetchBackupHistory()
        resetBackupForm()
      } catch (error) {
        console.error('Failed to run backup:', error)
        toast.error(t('settings.backup.toasts.backupError'))
      } finally {
        setRunningBackup(false)
      }
    } else {
      // Salvar configuração de backup agendado
      if (!backupForm.name.trim()) {
        toast.error(t('settings.backup.validation.nameRequired'))
        return
      }

      if (backupForm.destination === 'remote' && !backupForm.machineId) {
        toast.error(t('settings.backup.validation.machineRequired'))
        return
      }

      if (!backupForm.folder.trim()) {
        toast.error(t('settings.backup.validation.folderRequired'))
        return
      }

      setSavingBackup(true)
      try {
        const payload = {
          name: backupForm.name,
          destination: backupForm.destination,
          machineId: backupForm.destination === 'remote' ? backupForm.machineId : null,
          folder: backupForm.folder,
          retentionDays: backupForm.retentionDays,
          scheduleTime: backupForm.scheduleTime,
          scheduleDays: backupForm.scheduleDays,
          isActive: true,
        }

        const url = '/api/backup/config'

        const res = await fetch(url, {
          method: editingConfig ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingConfig ? { id: editingConfig, ...payload } : payload),
        })

        if (!res.ok) {
          const error = await res.json()
          toast.error(error.error || t('settings.backup.toasts.configError'))
          return
        }

        toast.success(editingConfig ? t('settings.backup.toasts.configUpdated') : t('settings.backup.toasts.configSaved'))
        resetBackupForm()
        fetchBackupConfigs()
      } catch (error) {
        console.error('Failed to save backup config:', error)
        toast.error(t('settings.backup.toasts.configError'))
      } finally {
        setSavingBackup(false)
      }
    }
  }

  const handleDeleteConfig = async (config: BackupConfig) => {
    const accepted = await confirm({
      title: t('common.delete'),
      description: t('settings.backup.confirmDelete', { name: config.name }),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/backup/config?id=${config.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.backup.toasts.deleteError'))
        return
      }
      toast.success(t('settings.backup.toasts.deleted'))
      fetchBackupConfigs()
    } catch (error) {
      console.error('Failed to delete config:', error)
      toast.error(t('settings.backup.toasts.deleteError'))
    }
  }

  const handleToggleConfig = async (config: BackupConfig) => {
    try {
      const res = await fetch('/api/backup/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, isActive: !config.isActive }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('settings.backup.toasts.toggleError'))
        return
      }
      fetchBackupConfigs()
    } catch (error) {
      console.error('Failed to toggle config:', error)
    }
  }

  const handleRestoreBackup = async (historyId: string) => {
    const accepted = await confirm({
      title: t('settings.backup.restoreConfirm'),
      description: t('settings.backup.restoreWarning'),
      confirmText: t('settings.backup.restore'),
      variant: 'danger',
    })
    if (!accepted) return

    setRestoringBackup(historyId)
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || t('settings.backup.toasts.restoreError'))
        return
      }

      toast.success(t('settings.backup.toasts.restoreSuccess'))
    } catch (error) {
      console.error('Failed to restore backup:', error)
      toast.error(t('settings.backup.toasts.restoreError'))
    } finally {
      setRestoringBackup(null)
    }
  }

  const handleRestoreUpload = async (file: File) => {
    setUploadingRestore(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/backup/restore-upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || t('settings.backup.toasts.restoreError'))
        return
      }

      toast.success(t('settings.backup.toasts.restoreSuccess'))
    } catch (error) {
      console.error('Failed to restore from upload:', error)
      toast.error(t('settings.backup.toasts.restoreError'))
    } finally {
      setUploadingRestore(false)
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '--'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const machineOptions = [
    { value: 'all', label: t('settings.alerts.machineAll') },
    ...machines.map((machine) => ({
      value: machine.id,
      label: machine.ip ? `${machine.hostname} (${machine.ip})` : machine.hostname,
    })),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-dark-500 dark:text-dark-400">
          {isSuperAdmin
            ? t('settings.subtitleAdmin')
            : t('settings.subtitleUser')}
        </p>
      </div>

      {isSuperAdmin && (
        <>
          <Card className="p-6">
            <button
              type="button"
              onClick={() => toggleSection('publicUrl')}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={openSections.publicUrl}
            >
              <div className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-primary-500" />
                <h2 className="text-lg font-semibold">{t('settings.publicUrl.title')}</h2>
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.publicUrl ? 'rotate-180' : ''}`}
              />
            </button>

            {openSections.publicUrl && (
              <div className="mt-4">
                <Input
                  label={t('settings.publicUrl.label')}
                  value={config.publicBaseUrl}
                  onChange={(e) => setConfig((prev) => ({ ...prev, publicBaseUrl: e.target.value }))}
                  placeholder={t('settings.publicUrl.placeholder')}
                />
                <p className="mt-2 text-sm text-dark-500">
                  {t('settings.publicUrl.hint')}
                </p>
                <div className="mt-4">
                  <Button onClick={saveBranding} disabled={isSavingBranding}>
                    {isSavingBranding ? t('common.saving') : t('settings.publicUrl.save')}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <button
              type="button"
              onClick={() => toggleSection('branding')}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={openSections.branding}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary-500" />
                <h2 className="text-lg font-semibold">{t('settings.branding.title')}</h2>
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.branding ? 'rotate-180' : ''}`}
              />
            </button>

            {openSections.branding && (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">{t('settings.branding.logoLabel')}</label>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-dark-100 dark:bg-dark-700"
                        aria-label={t('settings.branding.selectLogo')}
                      >
                        <img
                          src={logoPreviewError ? defaultLogoSrc : (config.brandingLogoUrl || defaultLogoSrc)}
                          alt={t('settings.branding.logoLabel')}
                          className="h-12 w-12 object-contain"
                          onError={() => {
                            if (config.brandingLogoUrl) setLogoPreviewError(true)
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-dark-900/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <ImageIcon className="h-5 w-5 text-white" />
                        </div>
                      </button>
                      <div className="space-y-1 text-sm text-dark-500">
                        <p>{t('settings.branding.clickToChange')}</p>
                        {logoUploading && <p className="text-xs text-dark-500">{t('settings.branding.uploadingLogo')}</p>}
                      </div>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        if (file) uploadFile(file, 'logo')
                        e.currentTarget.value = ''
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">{t('settings.branding.faviconLabel')}</label>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => faviconInputRef.current?.click()}
                        className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-dark-100 dark:bg-dark-700"
                        aria-label={t('settings.branding.selectFavicon')}
                      >
                        <img
                          src={faviconPreviewError ? defaultFaviconSrc : (config.brandingFaviconUrl || defaultFaviconSrc)}
                          alt={t('settings.branding.faviconLabel')}
                          className="h-10 w-10 object-contain"
                          onError={() => {
                            if (config.brandingFaviconUrl) setFaviconPreviewError(true)
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-dark-900/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <ImageIcon className="h-5 w-5 text-white" />
                        </div>
                      </button>
                      <div className="space-y-1 text-sm text-dark-500">
                        <p>{t('settings.branding.clickToChange')}</p>
                        {faviconUploading && <p className="text-xs text-dark-500">{t('settings.branding.uploadingFavicon')}</p>}
                      </div>
                    </div>
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0]
                        if (file) uploadFile(file, 'favicon')
                        e.currentTarget.value = ''
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Button onClick={saveBranding} disabled={isSavingBranding}>
                    {isSavingBranding ? t('common.saving') : t('settings.branding.save')}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card className="p-6">
            <button
              type="button"
              onClick={() => toggleSection('smtp')}
              className="flex w-full items-center justify-between gap-3 text-left"
              aria-expanded={openSections.smtp}
            >
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary-500" />
                <h2 className="text-lg font-semibold">{t('settings.smtp.title')}</h2>
                {smtpStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin text-dark-400" />}
                {smtpStatus === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {smtpStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              </div>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${openSections.smtp ? 'rotate-180' : ''}`}
              />
            </button>

            {openSections.smtp && (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label={t('settings.smtp.host')}
                    value={config.smtpHost}
                    onChange={(e) => setConfig((prev) => ({ ...prev, smtpHost: e.target.value }))}
                    placeholder={t('settings.smtp.hostPlaceholder')}
                  />
                  <Input
                    label={t('settings.smtp.port')}
                    type="number"
                    value={config.smtpPort}
                    onChange={(e) => setConfig((prev) => ({ ...prev, smtpPort: parseInt(e.target.value) }))}
                    placeholder={t('settings.smtp.portPlaceholder')}
                  />
                  <Input
                    label={t('settings.smtp.user')}
                    value={config.smtpUser}
                    onChange={(e) => setConfig((prev) => ({ ...prev, smtpUser: e.target.value }))}
                    placeholder={t('settings.smtp.userPlaceholder')}
                  />
                  <Input
                    label={t('settings.smtp.pass')}
                    type="password"
                    value={config.smtpPass}
                    onChange={(e) => setConfig((prev) => ({ ...prev, smtpPass: e.target.value }))}
                    placeholder={t('settings.smtp.passPlaceholder')}
                  />
                  <Input
                    label={t('settings.smtp.from')}
                    value={config.smtpFrom}
                    onChange={(e) => setConfig((prev) => ({ ...prev, smtpFrom: e.target.value }))}
                    placeholder={t('settings.smtp.fromPlaceholder')}
                  />
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-200">
                      {t('settings.smtp.security')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.smtpSecure}
                        onChange={(e) => setConfig((prev) => ({
                          ...prev,
                          smtpSecure: e.target.checked,
                          smtpStarttls: e.target.checked ? false : prev.smtpStarttls,
                        }))}
                        className="h-4 w-4"
                      />
                      {t('settings.smtp.secure')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.smtpStarttls}
                        onChange={(e) => setConfig((prev) => ({
                          ...prev,
                          smtpStarttls: e.target.checked,
                          smtpSecure: e.target.checked ? false : prev.smtpSecure,
                        }))}
                        className="h-4 w-4"
                      />
                      {t('settings.smtp.starttls')}
                    </label>
                  </div>
                </div>

                <div className="mt-4">
                  <Button onClick={saveSmtp} disabled={isSavingSmtp}>
                    {isSavingSmtp ? t('common.saving') : t('settings.smtp.save')}
                  </Button>
                  {smtpMessage && (
                    <p className={`mt-3 text-sm ${smtpStatus === 'success' ? 'text-green-600' : smtpStatus === 'error' ? 'text-red-600' : 'text-dark-500'}`}>
                      {smtpMessage}
                    </p>
                  )}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <Card className="p-6">
        <button
          type="button"
          onClick={() => toggleSection('language')}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={openSections.language}
        >
          <div className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold">{t('settings.languageTitle')}</h2>
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${openSections.language ? 'rotate-180' : ''}`}
          />
        </button>

        {openSections.language && (
          <>
            <p className="mt-3 text-sm text-dark-500">
              {t('settings.languageDescription')}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Select
                label={t('settings.languageLabel')}
                options={localeOptions}
                value={locale}
                onChange={(e) => handleLocaleChange(e.target.value)}
              />
            </div>
            <p className="mt-2 text-sm text-dark-500">
              {t('settings.languageHint')}
            </p>
            {savingLocale && (
              <p className="mt-2 text-sm text-dark-500">{t('settings.languageSaving')}</p>
            )}
          </>
        )}
      </Card>

      <Card className="p-6">
        <button
          type="button"
          onClick={() => toggleSection('password')}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={openSections.password}
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold">{t('settings.password.title')}</h2>
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${openSections.password ? 'rotate-180' : ''}`}
          />
        </button>

        {openSections.password && (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                label={t('settings.password.current')}
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="********"
              />
              <Input
                label={t('settings.password.new')}
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="********"
              />
              <Input
                label={t('settings.password.confirm')}
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="********"
              />
            </div>
            <p className="mt-2 text-sm text-dark-500">
              {t('settings.password.hint')}
            </p>
            <div className="mt-4">
              <Button onClick={handlePasswordChange} disabled={savingPassword}>
                {savingPassword ? t('common.saving') : t('settings.password.save')}
              </Button>
            </div>
          </>
        )}
      </Card>

      {isSuperAdmin && (
        <Card className="p-6">
          <button
            type="button"
            onClick={() => toggleSection('mfa')}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={openSections.mfa}
          >
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-semibold">{t('settings.mfa.title')}</h2>
              {mfaRequired ? (
                <Badge variant="success">{t('settings.mfa.enabled')}</Badge>
              ) : (
                <Badge variant="secondary">{t('settings.mfa.disabled')}</Badge>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${openSections.mfa ? 'rotate-180' : ''}`}
            />
          </button>

          {openSections.mfa && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-dark-500">{t('settings.mfa.systemDescription')}</p>

              <div className="flex items-center justify-between rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                <div>
                  <p className="font-medium">{t('settings.mfa.requireForAll')}</p>
                  <p className="text-sm text-dark-500">{t('settings.mfa.requireForAllHint')}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mfaRequired}
                  onClick={handleMfaToggle}
                  disabled={mfaLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mfaRequired ? 'bg-primary-500' : 'bg-dark-300 dark:bg-dark-600'
                    } ${mfaLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mfaRequired ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              {mfaRequired && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-green-700 dark:bg-green-900/20 dark:text-green-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm">{t('settings.mfa.allUsersRequired')}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="p-6">
        <button
          type="button"
          onClick={() => toggleSection('alerts')}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={openSections.alerts}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold">{t('settings.alerts.title')}</h2>
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${openSections.alerts ? 'rotate-180' : ''}`}
          />
        </button>

        {openSections.alerts && (
          <div className="mt-4 space-y-6">
            <div className="rounded-lg border border-dark-200 p-4 dark:border-dark-700">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={t('settings.alerts.nameLabel')}
                  value={alertForm.name}
                  onChange={(e) => setAlertForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('settings.alerts.namePlaceholder')}
                />
                <Select
                  label={t('settings.alerts.machineLabel')}
                  options={machineOptions}
                  value={alertForm.machineId}
                  onChange={(e) => setAlertForm((prev) => ({ ...prev, machineId: e.target.value }))}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={alertForm.cpuEnabled}
                    onChange={(e) => setAlertForm((prev) => ({ ...prev, cpuEnabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-sm text-dark-700 dark:text-dark-200">{t('settings.alerts.cpuAbove')}</span>
                    <div className="w-20">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={alertForm.cpuThreshold}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setAlertForm((prev) => ({
                            ...prev,
                            cpuThreshold: Number.isNaN(value) ? 0 : value,
                          }))
                        }}
                        disabled={!alertForm.cpuEnabled}
                      />
                    </div>
                    <span className="text-sm text-dark-500">%</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={alertForm.memoryEnabled}
                    onChange={(e) => setAlertForm((prev) => ({ ...prev, memoryEnabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <div className="flex flex-1 items-center gap-2">
                    <span className="text-sm text-dark-700 dark:text-dark-200">{t('settings.alerts.memoryAbove')}</span>
                    <div className="w-20">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={alertForm.memoryThreshold}
                        onChange={(e) => {
                          const value = Number(e.target.value)
                          setAlertForm((prev) => ({
                            ...prev,
                            memoryThreshold: Number.isNaN(value) ? 0 : value,
                          }))
                        }}
                        disabled={!alertForm.memoryEnabled}
                      />
                    </div>
                    <span className="text-sm text-dark-500">%</span>
                  </div>
                </div>

                <label className="flex items-center gap-3 text-sm text-dark-700 dark:text-dark-200">
                  <input
                    type="checkbox"
                    checked={alertForm.containerDown}
                    onChange={(e) => setAlertForm((prev) => ({ ...prev, containerDown: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {t('settings.alerts.containerDown')}
                </label>

                <label className="flex items-center gap-3 text-sm text-dark-700 dark:text-dark-200">
                  <input
                    type="checkbox"
                    checked={alertForm.machineOffline}
                    onChange={(e) => setAlertForm((prev) => ({ ...prev, machineOffline: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {t('settings.alerts.machineOffline')}
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-dark-600 dark:text-dark-300">
                  <input
                    type="checkbox"
                    checked={alertForm.isActive}
                    onChange={(e) => setAlertForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {t('settings.alerts.active')}
                </label>
                <Button onClick={handleCreateAlert} disabled={savingAlert}>
                  {savingAlert ? t('common.saving') : t('settings.alerts.create')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {alertsLoading ? (
                <div className="rounded-lg border border-dark-200 p-4 text-sm text-dark-500 dark:border-dark-700">
                  {t('settings.alerts.loading')}
                </div>
              ) : alerts.length === 0 ? (
                <div className="rounded-lg border border-dark-200 p-4 text-sm text-dark-500 dark:border-dark-700">
                  {t('settings.alerts.empty')}
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{alert.name}</p>
                        {alert.isActive ? (
                          <Badge variant="success">{t('common.active')}</Badge>
                        ) : (
                          <Badge variant="secondary">{t('common.paused')}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-dark-500">
                        {alert.machine
                          ? `${t('settings.alerts.machineLabel')}: ${alert.machine.hostname}`
                          : t('settings.alerts.machineAll')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {buildAlertConditions(alert).map((condition) => (
                          <Badge key={condition} variant="secondary">
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleAlert(alert)}
                      >
                        {alert.isActive ? t('settings.alerts.pause') : t('settings.alerts.activate')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAlert(alert)}
                      >
                        <span className="text-red-500">{t('common.delete')}</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Card>

      {isSuperAdmin && (
        <Card className="p-6">
          <button
            type="button"
            onClick={() => toggleSection('backup')}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={openSections.backup}
          >
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-semibold">{t('settings.backup.title')}</h2>
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${openSections.backup ? 'rotate-180' : ''}`}
            />
          </button>

          {openSections.backup && (
            <div className="mt-4 space-y-6">
              <p className="text-sm text-dark-500">{t('settings.backup.description')}</p>

              {/* Formulário Único */}
              <div className="rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                <h3 className="mb-4 font-medium">{editingConfig ? t('settings.backup.editConfig') : t('settings.backup.configSection')}</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <Select
                    label={t('settings.backup.mode')}
                    options={[
                      { value: 'immediate', label: t('settings.backup.modeImmediate') },
                      { value: 'scheduled', label: t('settings.backup.modeScheduled') },
                    ]}
                    value={backupForm.mode}
                    onChange={(e) => setBackupForm((prev) => ({ ...prev, mode: e.target.value as 'immediate' | 'scheduled' }))}
                  />

                  {backupForm.mode === 'scheduled' && (
                    <Input
                      label={t('settings.backup.nameLabel')}
                      value={backupForm.name}
                      onChange={(e) => setBackupForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={t('settings.backup.namePlaceholder')}
                    />
                  )}

                  <Select
                    label={t('settings.backup.destination')}
                    options={[
                      { value: 'local', label: t('settings.backup.destinationLocal') },
                      { value: 'remote', label: t('settings.backup.destinationRemote') },
                    ]}
                    value={backupForm.destination}
                    onChange={(e) => setBackupForm((prev) => ({ ...prev, destination: e.target.value as 'local' | 'remote' }))}
                  />

                  {backupForm.destination === 'remote' && (
                    <Select
                      label={t('settings.backup.machineLabel')}
                      options={[
                        { value: '', label: t('settings.backup.machinePlaceholder') },
                        ...machines.map((m) => ({
                          value: m.id,
                          label: m.ip ? `${m.hostname} (${m.ip})` : m.hostname,
                        })),
                      ]}
                      value={backupForm.machineId}
                      onChange={(e) => setBackupForm((prev) => ({ ...prev, machineId: e.target.value }))}
                    />
                  )}

                  <Input
                    label={t('settings.backup.folder')}
                    value={backupForm.folder}
                    onChange={(e) => setBackupForm((prev) => ({ ...prev, folder: e.target.value }))}
                    placeholder={t('settings.backup.folderPlaceholder')}
                  />

                  <Input
                    label={t('settings.backup.retentionDays')}
                    type="number"
                    min={0}
                    max={365}
                    value={backupForm.retentionDays}
                    onChange={(e) => setBackupForm((prev) => ({ ...prev, retentionDays: parseInt(e.target.value) || 0 }))}
                  />

                  {backupForm.mode === 'scheduled' && (
                    <Input
                      label={t('settings.backup.scheduleTime')}
                      type="time"
                      value={backupForm.scheduleTime}
                      onChange={(e) => setBackupForm((prev) => ({ ...prev, scheduleTime: e.target.value }))}
                    />
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={handleSaveBackup} disabled={savingBackup || runningBackup}>
                    {runningBackup ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('settings.backup.running')}
                      </>
                    ) : savingBackup ? (
                      t('common.saving')
                    ) : backupForm.mode === 'immediate' ? (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        {t('settings.backup.runNow')}
                      </>
                    ) : editingConfig ? (
                      t('settings.backup.update')
                    ) : (
                      t('settings.backup.create')
                    )}
                  </Button>
                  {editingConfig && (
                    <Button variant="secondary" onClick={resetBackupForm}>
                      {t('common.cancel')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Lista de Backups Agendados */}
              {backupConfigs.length > 0 && (
                <div className="rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                  <h3 className="mb-4 font-medium">{t('settings.backup.scheduledSection')}</h3>
                  <div className="space-y-3">
                    {backupConfigs.map((config) => (
                      <div key={config.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                        <div className="min-w-[240px] flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{config.name}</p>
                            {config.isActive ? (
                              <Badge variant="success">{t('common.active')}</Badge>
                            ) : (
                              <Badge variant="secondary">{t('common.paused')}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-dark-500">
                            {config.destination === 'local'
                              ? t('settings.backup.destinationLocal')
                              : config.machine
                                ? `${t('settings.backup.destinationRemote')}: ${config.machine.hostname}`
                                : t('settings.backup.destinationRemote')}
                            {' • '}
                            {t('settings.backup.scheduleTime')}: {config.scheduleTime}
                          </p>
                          {config.lastRunAt && (
                            <p className="text-xs text-dark-400">
                              {t('settings.backup.lastRun')}: {new Date(config.lastRunAt).toLocaleString(dateLocale)}
                              {' • '}
                              {config.lastRunStatus === 'success' ? (
                                <span className="text-green-600">{t('settings.backup.lastRunSuccess')}</span>
                              ) : (
                                <span className="text-red-600">{t('settings.backup.lastRunError')}</span>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleToggleConfig(config)}
                          >
                            {config.isActive ? t('settings.backup.pause') : t('settings.backup.activate')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEditConfig(config)}
                          >
                            {t('common.edit')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteConfig(config)}
                          >
                            <span className="text-red-500">{t('common.delete')}</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção de Restore */}
              <div className="rounded-lg border border-dark-200 p-4 dark:border-dark-700">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">{t('settings.backup.restoreSection')}</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => restoreUploadRef.current?.click()}
                    disabled={uploadingRestore}
                  >
                    {uploadingRestore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('settings.backup.uploading')}
                      </>
                    ) : (
                      <>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('settings.backup.restoreUpload')}
                      </>
                    )}
                  </Button>
                  <input
                    ref={restoreUploadRef}
                    type="file"
                    accept=".sql"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0]
                      if (file) handleRestoreUpload(file)
                      e.currentTarget.value = ''
                    }}
                  />
                </div>

                {backupHistory.length === 0 ? (
                  <p className="text-sm text-dark-500">{t('settings.backup.noHistory')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-200 text-left dark:border-dark-700">
                          <th className="pb-2 font-medium">{t('settings.backup.historyFileName')}</th>
                          <th className="pb-2 font-medium">{t('settings.backup.historyDate')}</th>
                          <th className="pb-2 font-medium">{t('settings.backup.historySize')}</th>
                          <th className="pb-2 font-medium">{t('settings.backup.historyDestination')}</th>
                          <th className="pb-2 font-medium">{t('settings.backup.historyStatus')}</th>
                          <th className="pb-2 font-medium">{t('settings.backup.historyActions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupHistory.map((item) => (
                          <tr key={item.id} className="border-b border-dark-100 last:border-b-0 dark:border-dark-800">
                            <td className="py-2 font-mono text-xs">{item.fileName}</td>
                            <td className="py-2">{new Date(item.createdAt).toLocaleString(dateLocale)}</td>
                            <td className="py-2">{formatFileSize(item.fileSize)}</td>
                            <td className="py-2">
                              {item.destination === 'local'
                                ? t('settings.backup.destinationLocal')
                                : t('settings.backup.destinationRemote')}
                            </td>
                            <td className="py-2">
                              {item.status === 'success' ? (
                                <Badge variant="success">{t('settings.backup.lastRunSuccess')}</Badge>
                              ) : (
                                <Badge variant="secondary">{t('settings.backup.lastRunError')}</Badge>
                              )}
                            </td>
                            <td className="py-2">
                              {item.status === 'success' && item.destination === 'local' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRestoreBackup(item.id)}
                                  disabled={restoringBackup === item.id}
                                >
                                  {restoringBackup === item.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  <span className="ml-1">{t('settings.backup.restore')}</span>
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
