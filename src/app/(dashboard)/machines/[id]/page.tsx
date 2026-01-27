'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Badge } from '@/components/ui'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { PasswordReveal } from '@/components/features/PasswordReveal'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import { ArrowLeft, Server, Key, Copy, Download, Trash2, Plus } from 'lucide-react'

interface MachineDetail {
  id: string
  hostname: string
  ip: string | null
  description: string | null
  os: string | null
  osVersion: string | null
  sshPort: number
  notes: string | null
  encryptedUser: string | null
  encryptedPass: string | null
  encryptedSSHKey: string | null
  createdBy: { name: string; email: string }
  provider?: { id: string; name: string } | null
  credentials: Array<{ id: string; name: string; username: string | null; platform?: { name: string } | null }>
}

interface Permission {
  id: string
  actions: Array<'CREATE' | 'READ' | 'UPDATE' | 'DELETE'>
  group?: { id: string; name: string } | null
}

interface Group {
  id: string
  name: string
}

export default function MachineDetailPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [machine, setMachine] = useState<MachineDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [shareGroupId, setShareGroupId] = useState('')
  const [shareActions, setShareActions] = useState<Array<'READ' | 'UPDATE' | 'DELETE'>>([])
  const [isSavingShare, setIsSavingShare] = useState(false)

  useEffect(() => {
    const fetchMachine = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/machines/${params.id}`)
        const data = await res.json()
        setMachine(data)
        setIsPermissionsLoading(true)
        try {
          const permRes = await fetch(`/api/permissions?resourceType=MACHINE&resourceId=${params.id}`)
          if (permRes.ok) {
            const permData = await permRes.json()
            setPermissions(permData.data || [])
          } else {
            setPermissions([])
          }
        } catch (error) {
          console.error('Failed to fetch permissions:', error)
          setPermissions([])
        } finally {
          setIsPermissionsLoading(false)
        }
      } catch (error) {
        console.error('Failed to fetch machine:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMachine()
  }, [params.id])

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await fetch('/api/groups')
        const data = await res.json()
        setGroups(data.data || [])
      } catch (error) {
        console.error('Failed to fetch groups:', error)
      }
    }

    fetchGroups()
  }, [])

  if (isLoading) {
    return <div className="text-dark-500">{t('machineDetail.loading')}</div>
  }

  if (!machine) {
    return <div className="text-dark-500">{t('machineDetail.notFound')}</div>
  }

  const logCredentialCopy = async (credentialId: string, field: 'password' | 'username') => {
    try {
      await fetch(`/api/credentials/${credentialId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
    } catch (error) {
      console.error('Failed to log credential copy:', error)
    }
  }

  const logMachineSecret = async (
    action: 'SECRET_VIEWED' | 'SECRET_COPIED',
    field: 'username' | 'password' | 'sshKey',
    method?: string
  ) => {
    try {
      await fetch(`/api/machines/${params.id}/secret-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, field, method }),
      })
    } catch (error) {
      console.error('Failed to log machine secret access:', error)
    }
  }

  const copyValue = async (
    value: string | null,
    field: string,
    audit?: () => Promise<void>
  ) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      if (audit) {
        try {
          await audit()
        } catch (error) {
          console.error('Failed to log audit:', error)
        }
      }
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const downloadSshKey = () => {
    if (!machine.encryptedSSHKey) return
    const blob = new Blob([machine.encryptedSSHKey], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${machine.hostname}-ssh-key.txt`
    link.click()
    window.URL.revokeObjectURL(url)
    logMachineSecret('SECRET_COPIED', 'sshKey', 'download')
  }

  const handleRevealPassword = async (credentialId: string): Promise<string> => {
    const res = await fetch(`/api/credentials/${credentialId}/reveal`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || t('credentials.errors.reveal'))
    }
    const data = await res.json()
    return data.password
  }

  const formatActions = (actions: Array<'CREATE' | 'READ' | 'UPDATE' | 'DELETE'>) => {
    const labels: Record<string, string> = {
      READ: t('common.read'),
      UPDATE: t('common.update'),
      DELETE: t('common.deleteAction'),
      CREATE: t('common.createAction'),
    }
    return actions.map((action) => labels[action] || action).join(', ')
  }

  const handleShareGroupChange = (groupId: string) => {
    setShareGroupId(groupId)
    const existing = permissions.find((p) => p.group?.id === groupId)
    if (existing) {
      const filtered = existing.actions.filter(
        (action) => action === 'READ' || action === 'UPDATE' || action === 'DELETE'
      ) as Array<'READ' | 'UPDATE' | 'DELETE'>
      setShareActions(filtered)
    } else {
      setShareActions([])
    }
  }

  const toggleShareAction = (action: 'READ' | 'UPDATE' | 'DELETE') => {
    setShareActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    )
  }

  const saveShare = async () => {
    if (!machine || !shareGroupId) return
    setIsSavingShare(true)

    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: shareGroupId,
          resourceType: 'MACHINE',
          resourceId: machine.id,
          actions: shareActions,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('machineDetail.shareError'))
        return
      }

      toast.success(t('machineDetail.shareUpdated'))
      setShareGroupId('')
      setShareActions([])
      const permRes = await fetch(`/api/permissions?resourceType=MACHINE&resourceId=${machine.id}`)
      if (permRes.ok) {
        const permData = await permRes.json()
        setPermissions(permData.data || [])
      }
    } catch (error) {
      console.error('Failed to save share:', error)
      toast.error(t('machineDetail.shareError'))
    } finally {
      setIsSavingShare(false)
    }
  }

  const removeShare = async (permission: Permission) => {
    if (!machine || !permission.group?.id) return
    const accepted = await confirm({
      title: t('machineDetail.removeShareTitle'),
      description: t('machineDetail.removeShareDescription', { name: permission.group.name }),
      confirmText: t('common.remove'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: permission.group.id,
          resourceType: 'MACHINE',
          resourceId: machine.id,
          actions: [],
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('machineDetail.removeShareError'))
        return
      }

      toast.success(t('machineDetail.removeShareSuccess'))
      setPermissions((prev) => prev.filter((p) => p.id !== permission.id))
    } catch (error) {
      console.error('Failed to remove share:', error)
      toast.error(t('machineDetail.removeShareError'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{machine.hostname}</h1>
            <p className="text-dark-500 dark:text-dark-400">
              {t('machineDetail.details')}
            </p>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-dark-500">{t('common.hostname')}</p>
              <p className="font-medium">{machine.hostname}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.ip')}</p>
            <p className="font-medium">{machine.ip || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.os')}</p>
            <p className="font-medium">
              {machine.os ? (machine.osVersion ? `${machine.os} ${machine.osVersion}` : machine.os) : '-'}
            </p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.sshPort')}</p>
            <p className="font-medium">{machine.sshPort}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.provider')}</p>
            <p className="font-medium">{machine.provider?.name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.createdBy')}</p>
            <p className="font-medium">{machine.createdBy.name}</p>
          </div>
          {machine.description && (
            <div className="md:col-span-2">
              <p className="text-sm text-dark-500">{t('common.description')}</p>
              <p className="font-medium">{machine.description}</p>
            </div>
          )}
          {machine.notes && (
            <div className="md:col-span-2">
              <p className="text-sm text-dark-500">{t('common.notes')}</p>
              <p className="font-medium">{machine.notes}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-dark-400" />
          <h2 className="text-lg font-semibold">{t('machineDetail.shareSection')}</h2>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-dashed border-dark-200 p-4 dark:border-dark-700">
            <div className="grid gap-4 md:grid-cols-[1.5fr_2fr_auto]">
              <Select
                label={t('machineDetail.addGroup')}
                options={[
                  { value: '', label: t('machines.selectGroup') },
                  ...groups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                value={shareGroupId}
                onChange={(e) => handleShareGroupChange(e.target.value)}
              />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-200">
                  {t('machineDetail.permissionsLabel')}
                </label>
                <div className="flex flex-wrap gap-4 text-sm">
                  {(['READ', 'UPDATE', 'DELETE'] as const).map((action) => (
                    <label key={action} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={shareActions.includes(action)}
                        onChange={() => toggleShareAction(action)}
                      />
                      {action === 'READ' && t('common.read')}
                      {action === 'UPDATE' && t('common.update')}
                      {action === 'DELETE' && t('common.deleteAction')}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={saveShare} disabled={!shareGroupId || isSavingShare}>
                  <Plus className="mr-2 h-4 w-4" />
                  {isSavingShare ? t('common.saving') : t('machineDetail.saveShare')}
                </Button>
              </div>
            </div>
          </div>
          {isPermissionsLoading ? (
            <p className="text-sm text-dark-500">{t('machineDetail.shareLoading')}</p>
          ) : permissions.filter((p) => p.group).length === 0 ? (
            <p className="text-sm text-dark-500">{t('machineDetail.noShares')}</p>
          ) : (
            permissions
              .filter((p) => p.group)
              .map((permission) => (
                <div
                  key={permission.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-200 px-4 py-3 text-sm dark:border-dark-700"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{permission.group?.name}</Badge>
                    <span className="text-xs text-dark-500">
                      {formatActions(permission.actions)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeShare(permission)}
                    title={t('machineDetail.removeShareTitle')}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-dark-400" />
          <h2 className="text-lg font-semibold">{t('machineDetail.sshAccess')}</h2>
        </div>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-dark-500">{t('common.username')}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 rounded-lg bg-dark-100 px-3 py-2 text-sm dark:bg-dark-700">
                  {machine.encryptedUser || '-'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyValue(machine.encryptedUser, 'username', () =>
                      logMachineSecret('SECRET_COPIED', 'username')
                    )
                  }
                  disabled={!machine.encryptedUser}
                  title={t('machineDetail.copyUser')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {copiedField === 'username' && (
                <p className="mt-1 text-xs text-green-600">{t('machineDetail.userCopied')}</p>
              )}
            </div>
            <div>
              <p className="text-sm text-dark-500">{t('common.password')}</p>
              <div className="mt-2">
                {machine.encryptedPass ? (
                  <PasswordReveal
                    onReveal={async () => machine.encryptedPass as string}
                    onRevealAudit={() => logMachineSecret('SECRET_VIEWED', 'password')}
                    onCopyAudit={() => logMachineSecret('SECRET_COPIED', 'password')}
                  />
                ) : (
                  <div className="rounded-lg bg-dark-100 px-3 py-2 text-sm dark:bg-dark-700">-</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-dark-500">{t('machines.form.sshKeyLabel')}</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyValue(machine.encryptedSSHKey, 'ssh', () =>
                      logMachineSecret('SECRET_COPIED', 'sshKey')
                    )
                  }
                  disabled={!machine.encryptedSSHKey}
                  title={t('machineDetail.copySsh')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={downloadSshKey}
                  disabled={!machine.encryptedSSHKey}
                  title={t('machineDetail.downloadSsh')}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Textarea
              value={machine.encryptedSSHKey || ''}
              readOnly
              placeholder={t('machineDetail.noSshKey')}
              className="mt-2 font-mono text-xs"
              rows={6}
            />
            {copiedField === 'ssh' && (
              <p className="mt-1 text-xs text-green-600">{t('machineDetail.sshCopied')}</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-dark-400" />
          <h2 className="text-lg font-semibold">{t('machineDetail.credentialsSection')}</h2>
        </div>
        <div className="mt-4 space-y-3">
          {machine.credentials.length === 0 ? (
            <p className="text-sm text-dark-500">{t('machineDetail.noCredentials')}</p>
          ) : (
            machine.credentials.map((credential) => (
              <div
                key={credential.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dark-200 px-4 py-3 dark:border-dark-700"
              >
                <div className="min-w-[220px]">
                  <p className="font-medium">{credential.name}</p>
                  <p className="text-sm text-dark-500">
                    {credential.platform?.name || t('machineDetail.noPlatform')}
                  </p>
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{credential.username || t('machineDetail.noUsername')}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        copyValue(credential.username || '', `cred-user-${credential.id}`, () =>
                          logCredentialCopy(credential.id, 'username')
                        )
                      }
                      disabled={!credential.username}
                      title={t('machineDetail.copyUser')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="min-w-[220px]">
                    <PasswordReveal
                      onReveal={() => handleRevealPassword(credential.id)}
                      onCopyAudit={() => logCredentialCopy(credential.id, 'password')}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
