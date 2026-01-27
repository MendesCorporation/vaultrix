'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Card, Badge } from '@/components/ui'
import { Select } from '@/components/ui/Select'
import { PasswordReveal } from '@/components/features/PasswordReveal'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import { ArrowLeft, Key, Plus, Trash2, ExternalLink, Cloud, Server } from 'lucide-react'

interface CredentialDetail {
  id: string
  name: string
  type: 'LOGIN_PASSWORD' | 'API_TOKEN' | 'CLIENT_SECRET'
  username: string | null
  url: string | null
  notes: string | null
  tags: string[]
  expiresAt: string | null
  createdAt: string
  createdBy: { name: string; email: string }
  platform: { id: string; name: string; logoUrl: string | null } | null
  machine: { id: string; hostname: string; ip: string | null } | null
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

export default function CredentialDetailPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [credential, setCredential] = useState<CredentialDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [shareGroupId, setShareGroupId] = useState('')
  const [shareActions, setShareActions] = useState<Array<'READ' | 'UPDATE' | 'DELETE'>>([])
  const [isSavingShare, setIsSavingShare] = useState(false)

  useEffect(() => {
    const fetchCredential = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/credentials/${params.id}`)
        const data = await res.json()
        setCredential(data)
        setIsPermissionsLoading(true)
        try {
          const permRes = await fetch(`/api/permissions?resourceType=CREDENTIAL&resourceId=${params.id}`)
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
        console.error('Failed to fetch credential:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCredential()
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
    return <div className="text-dark-500">{t('credentials.loading')}</div>
  }

  if (!credential) {
    return <div className="text-dark-500">{t('credentials.notFound')}</div>
  }

  const handleRevealSecret = async (field?: 'password' | 'token' | 'clientId' | 'clientSecret'): Promise<string> => {
    const res = await fetch(`/api/credentials/${params.id}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: field ? JSON.stringify({ field }) : undefined,
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || t('credentials.errors.reveal'))
    }
    const data = await res.json()
    return data.value || data.password
  }

  const logCredentialCopy = async (field: 'password' | 'username' | 'token' | 'clientId' | 'clientSecret') => {
    try {
      await fetch(`/api/credentials/${params.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
    } catch (error) {
      console.error('Failed to log credential copy:', error)
    }
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
    if (!credential || !shareGroupId) return
    setIsSavingShare(true)

    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: shareGroupId,
          resourceType: 'CREDENTIAL',
          resourceId: credential.id,
          actions: shareActions,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('credentials.errors.share'))
        return
      }

      toast.success(t('credentials.shareSuccess'))
      setShareGroupId('')
      setShareActions([])
      const permRes = await fetch(`/api/permissions?resourceType=CREDENTIAL&resourceId=${credential.id}`)
      if (permRes.ok) {
        const permData = await permRes.json()
        setPermissions(permData.data || [])
      }
    } catch (error) {
      console.error('Failed to save share:', error)
      toast.error(t('credentials.errors.share'))
    } finally {
      setIsSavingShare(false)
    }
  }

  const removeShare = async (permission: Permission) => {
    if (!credential || !permission.group?.id) return
    const accepted = await confirm({
      title: t('credentials.removeShareTitle'),
      description: t('credentials.removeShareDescription', { name: permission.group.name }),
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
          resourceType: 'CREDENTIAL',
          resourceId: credential.id,
          actions: [],
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('credentials.removeShareError'))
        return
      }

      toast.success(t('credentials.removeShareSuccess'))
      setPermissions((prev) => prev.filter((p) => p.id !== permission.id))
    } catch (error) {
      console.error('Failed to remove share:', error)
      toast.error(t('credentials.removeShareError'))
    }
  }

  const getTypeLabel = () => {
    if (credential.type === 'LOGIN_PASSWORD') return t('credentials.form.types.login')
    if (credential.type === 'API_TOKEN') return t('credentials.form.types.apiToken')
    if (credential.type === 'CLIENT_SECRET') return t('credentials.form.types.clientSecret')
    return credential.type
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{credential.name}</h1>
            <p className="text-dark-500 dark:text-dark-400">
              {t('credentials.details')}
            </p>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Key className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-dark-500">{t('credentials.table.name')}</p>
              <p className="font-medium">{credential.name}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('credentials.form.typeLabel')}</p>
            <p className="font-medium">{getTypeLabel()}</p>
          </div>
          {credential.url && (
            <div className="md:col-span-2">
              <p className="text-sm text-dark-500">{t('credentials.form.urlLabel')}</p>
              <a
                href={credential.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-medium text-primary-500 hover:underline"
              >
                {credential.url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          <div>
            <p className="text-sm text-dark-500">{t('credentials.table.platformMachine')}</p>
            <div className="mt-1 flex items-center gap-2">
              {credential.platform && (
                <Badge variant="secondary">
                  <Cloud className="mr-1 h-3 w-3" />
                  {credential.platform.name}
                </Badge>
              )}
              {credential.machine && (
                <Badge variant="outline">
                  <Server className="mr-1 h-3 w-3" />
                  {credential.machine.hostname}
                </Badge>
              )}
              {!credential.platform && !credential.machine && '-'}
            </div>
          </div>
          <div>
            <p className="text-sm text-dark-500">{t('common.createdBy')}</p>
            <p className="font-medium">{credential.createdBy.name}</p>
          </div>
          {credential.notes && (
            <div className="md:col-span-2">
              <p className="text-sm text-dark-500">{t('credentials.form.notesLabel')}</p>
              <p className="font-medium">{credential.notes}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-dark-400" />
          <h2 className="text-lg font-semibold">{t('credentials.secretsSection')}</h2>
        </div>
        <div className="mt-4 space-y-4">
          {credential.type === 'LOGIN_PASSWORD' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-dark-500">{t('credentials.form.usernameLabel')}</p>
                <div className="mt-2 rounded-lg bg-dark-100 px-3 py-2 text-sm dark:bg-dark-700">
                  {credential.username || '-'}
                </div>
              </div>
              <div>
                <p className="text-sm text-dark-500">{t('credentials.form.passwordLabel')}</p>
                <div className="mt-2">
                  <PasswordReveal
                    onReveal={() => handleRevealSecret('password')}
                    onCopyAudit={() => logCredentialCopy('password')}
                  />
                </div>
              </div>
            </div>
          )}

          {credential.type === 'API_TOKEN' && (
            <div>
              <p className="text-sm text-dark-500">{t('credentials.form.tokenLabel')}</p>
              <div className="mt-2">
                <PasswordReveal
                  onReveal={() => handleRevealSecret('token')}
                  onCopyAudit={() => logCredentialCopy('token')}
                />
              </div>
            </div>
          )}

          {credential.type === 'CLIENT_SECRET' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-dark-500">{t('credentials.form.clientIdLabel')}</p>
                <div className="mt-2">
                  <PasswordReveal
                    onReveal={() => handleRevealSecret('clientId')}
                    onCopyAudit={() => logCredentialCopy('clientId')}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm text-dark-500">{t('credentials.form.clientSecretLabel')}</p>
                <div className="mt-2">
                  <PasswordReveal
                    onReveal={() => handleRevealSecret('clientSecret')}
                    onCopyAudit={() => logCredentialCopy('clientSecret')}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-dark-400" />
          <h2 className="text-lg font-semibold">{t('credentials.shareSection')}</h2>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-dashed border-dark-200 p-4 dark:border-dark-700">
            <div className="grid gap-4 md:grid-cols-[1.5fr_2fr_auto]">
              <Select
                label={t('credentials.addGroup')}
                options={[
                  { value: '', label: t('machines.selectGroup') },
                  ...groups.map((group) => ({ value: group.id, label: group.name })),
                ]}
                value={shareGroupId}
                onChange={(e) => handleShareGroupChange(e.target.value)}
              />
              <div className="space-y-2">
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-200">
                  {t('credentials.permissionsLabel')}
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
                  {isSavingShare ? t('common.saving') : t('credentials.saveShare')}
                </Button>
              </div>
            </div>
          </div>
          {isPermissionsLoading ? (
            <p className="text-sm text-dark-500">{t('credentials.shareLoading')}</p>
          ) : permissions.filter((p) => p.group).length === 0 ? (
            <p className="text-sm text-dark-500">{t('credentials.noShares')}</p>
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
                    title={t('credentials.removeShareTitle')}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))
          )}
        </div>
      </Card>
    </div>
  )
}
