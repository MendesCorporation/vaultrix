'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Badge, Input } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PasswordReveal } from '@/components/features/PasswordReveal'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  Plus,
  Search,
  Key,
  Edit,
  Trash2,
  ExternalLink,
  Server,
  Cloud,
  Copy,
} from 'lucide-react'

type CredentialType = 'LOGIN_PASSWORD' | 'API_TOKEN' | 'CLIENT_SECRET'

interface Credential {
  id: string
  name: string
  type: CredentialType
  username: string | null
  url: string | null
  tags: string[]
  expiresAt: string | null
  createdAt: string
  platform: { id: string; name: string; logoUrl: string | null } | null
  machine: { id: string; hostname: string; ip: string | null } | null
  createdBy: { name: string }
}

interface Platform {
  id: string
  name: string
  supportsLogin?: boolean
  supportsApiToken?: boolean
  supportsClientSecret?: boolean
}

interface Machine {
  id: string
  hostname: string
}

export default function CredentialsPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const router = useRouter()
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [machineFilter, setMachineFilter] = useState('')
  const [formError, setFormError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    type: 'LOGIN_PASSWORD' as CredentialType,
    username: '',
    password: '',
    token: '',
    clientId: '',
    clientSecret: '',
    url: '',
    notes: '',
    platformId: '',
    machineId: '',
  })

  const fetchCredentials = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (platformFilter) params.set('platformId', platformFilter)
      if (machineFilter) params.set('machineId', machineFilter)

      const res = await fetch(`/api/credentials?${params.toString()}`)
      const data = await res.json()
      setCredentials(data.data || [])
    } catch (error) {
      console.error('Failed to fetch credentials:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPlatformsAndMachines = async () => {
    try {
      const [platformsRes, machinesRes] = await Promise.all([
        fetch('/api/platforms?all=true'),
        fetch('/api/machines?limit=1000'),
      ])
      const platformsData = await platformsRes.json()
      const machinesData = await machinesRes.json()
      setPlatforms(platformsData.data || [])
      setMachines(machinesData.data || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    }
  }

  useEffect(() => {
    fetchCredentials()
    fetchPlatformsAndMachines()
  }, [search, platformFilter, machineFilter])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    try {
      const url = editingCredential
        ? `/api/credentials/${editingCredential.id}`
        : '/api/credentials'

      const payload: Record<string, any> = {
        name: formData.name,
        type: formData.type,
        url: formData.url,
        notes: formData.notes,
        platformId: formData.platformId || null,
        machineId: formData.machineId || null,
      }

      if (formData.type === 'LOGIN_PASSWORD') {
        payload.username = formData.username
        if (formData.password) payload.password = formData.password
      }

      if (formData.type === 'API_TOKEN') {
        if (formData.token) payload.token = formData.token
      }

      if (formData.type === 'CLIENT_SECRET') {
        if (formData.clientId) payload.clientId = formData.clientId
        if (formData.clientSecret) payload.clientSecret = formData.clientSecret
      }

      const res = await fetch(url, {
        method: editingCredential ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchCredentials()
      } else {
        const error = await res.json()
        setFormError(error.error || t('credentials.errors.save'))
      }
    } catch (error) {
      console.error('Failed to save credential:', error)
      setFormError(t('credentials.errors.save'))
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('credentials.confirmDeleteTitle'),
      description: t('credentials.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/credentials/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchCredentials()
      }
    } catch (error) {
      console.error('Failed to delete credential:', error)
    }
  }

  const handleRevealSecret = async (
    id: string,
    field?: 'password' | 'token' | 'clientId' | 'clientSecret'
  ): Promise<string> => {
    const res = await fetch(`/api/credentials/${id}/reveal`, {
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

  const logCredentialCopy = async (
    credentialId: string,
    field: 'password' | 'username' | 'token' | 'clientId' | 'clientSecret'
  ) => {
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

  const handleTypeChange = (value: CredentialType) => {
    // Check if current platform supports the new type
    const currentPlatform = platforms.find((p) => p.id === formData.platformId)
    let newPlatformId = formData.platformId

    if (currentPlatform) {
      const supportsNewType =
        (value === 'LOGIN_PASSWORD' && (currentPlatform.supportsLogin ?? true)) ||
        (value === 'API_TOKEN' && (currentPlatform.supportsApiToken ?? false)) ||
        (value === 'CLIENT_SECRET' && (currentPlatform.supportsClientSecret ?? false))

      if (!supportsNewType) {
        newPlatformId = ''
      }
    }

    setFormData((prev) => ({
      ...prev,
      type: value,
      platformId: newPlatformId,
      username: value === 'LOGIN_PASSWORD' ? prev.username : '',
      password: '',
      token: '',
      clientId: '',
      clientSecret: '',
    }))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'LOGIN_PASSWORD',
      username: '',
      password: '',
      token: '',
      clientId: '',
      clientSecret: '',
      url: '',
      notes: '',
      platformId: '',
      machineId: '',
    })
    setEditingCredential(null)
    setFormError('')
  }

  const openModal = (credential?: Credential) => {
    if (credential) {
      setEditingCredential(credential)
      setFormData({
        name: credential.name,
        type: credential.type,
        username: credential.username || '',
        password: '',
        token: '',
        clientId: '',
        clientSecret: '',
        url: credential.url || '',
        notes: '',
        platformId: credential.platform?.id || '',
        machineId: credential.machine?.id || '',
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  // Filter platforms based on selected credential type
  const filteredPlatforms = platforms.filter((p) => {
    if (formData.type === 'LOGIN_PASSWORD') return p.supportsLogin ?? true
    if (formData.type === 'API_TOKEN') return p.supportsApiToken ?? false
    if (formData.type === 'CLIENT_SECRET') return p.supportsClientSecret ?? false
    return true
  })

  const platformOptions = [
    { value: '', label: t('credentials.options.none') },
    ...filteredPlatforms.map((p) => ({ value: p.id, label: p.name })),
  ]

  const machineOptions = [
    { value: '', label: t('credentials.options.none') },
    ...machines.map((m) => ({ value: m.id, label: m.hostname })),
  ]

  const selectedPlatform = platforms.find((platform) => platform.id === formData.platformId)
  const typeOptions = [
    { value: 'LOGIN_PASSWORD', label: t('credentials.form.types.login') },
    { value: 'API_TOKEN', label: t('credentials.form.types.apiToken') },
    { value: 'CLIENT_SECRET', label: t('credentials.form.types.clientSecret') },
  ]

  const availableTypeOptions = editingCredential
    ? typeOptions
    : typeOptions.filter((option) => {
      if (!selectedPlatform) return true
      if (option.value === 'LOGIN_PASSWORD') return selectedPlatform.supportsLogin ?? true
      if (option.value === 'API_TOKEN') return selectedPlatform.supportsApiToken ?? false
      if (option.value === 'CLIENT_SECRET') return selectedPlatform.supportsClientSecret ?? false
      return true
    })

  useEffect(() => {
    if (editingCredential) return
    if (!availableTypeOptions.length) return
    const allowedValues = availableTypeOptions.map((option) => option.value)
    if (!allowedValues.includes(formData.type)) {
      setFormData((prev) => ({
        ...prev,
        type: availableTypeOptions[0].value as CredentialType,
        password: '',
        token: '',
        clientId: '',
        clientSecret: '',
      }))
    }
  }, [availableTypeOptions, editingCredential, formData.type])

  const requiresSecret = !editingCredential || (
    editingCredential && formData.type !== editingCredential.type
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('credentials.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('credentials.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('credentials.new')}
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
          <Input
            placeholder={t('credentials.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-48">
          <Select
            options={platformOptions}
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            placeholder={t('credentials.filterPlatform')}
          />
        </div>
        <div className="w-48">
          <Select
            options={machineOptions}
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            placeholder={t('credentials.filterMachine')}
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-200 dark:border-dark-700">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('credentials.table.name')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('credentials.table.username')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('credentials.table.password')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('credentials.table.platformMachine')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-dark-500">
                  {t('credentials.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-dark-500">
                    {t('credentials.loading')}
                  </td>
                </tr>
              ) : credentials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-dark-500">
                    {t('credentials.empty')}
                  </td>
                </tr>
              ) : (
                credentials.map((credential) => (
                  <tr key={credential.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                          credential.platform?.logoUrl 
                            ? 'bg-dark-50 dark:bg-dark-800' 
                            : 'bg-green-100 dark:bg-green-900/30'
                        }`}>
                          {credential.platform?.logoUrl ? (
                            <img
                              src={credential.platform.logoUrl}
                              alt={credential.platform.name}
                              className="h-6 w-6 object-contain"
                            />
                          ) : (
                            <Key className="h-5 w-5 text-green-600 dark:text-green-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{credential.name}</p>
                          {credential.url && (
                            <a
                              href={credential.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-primary-500 hover:underline"
                              title={credential.url}
                            >
                              <span className="truncate max-w-[180px]">{credential.url}</span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {credential.type === 'CLIENT_SECRET' ? (
                          <>
                            <div className="flex-1 rounded-lg bg-dark-100 px-3 py-2 font-mono text-sm dark:bg-dark-700">
                              ••••••••••••
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                try {
                                  const value = await handleRevealSecret(credential.id, 'clientId')
                                  await navigator.clipboard.writeText(value)
                                  await logCredentialCopy(credential.id, 'clientId')
                                  toast.success(t('common.copied'))
                                } catch (error) {
                                  toast.error(t('credentials.errors.reveal'))
                                }
                              }}
                              title={t('common.copy')}
                              className="flex-shrink-0"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <span className="font-mono text-sm">
                            {credential.username || '-'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-lg bg-dark-100 px-3 py-2 font-mono text-sm dark:bg-dark-700">
                          ••••••••••••
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            try {
                              const field = credential.type === 'CLIENT_SECRET' ? 'clientSecret' : 
                                           credential.type === 'API_TOKEN' ? 'token' : 'password'
                              const value = await handleRevealSecret(credential.id, field)
                              await navigator.clipboard.writeText(value)
                              await logCredentialCopy(credential.id, field)
                              toast.success(t('common.copied'))
                            } catch (error) {
                              toast.error(t('credentials.errors.reveal'))
                            }
                          }}
                          title={t('common.copy')}
                          className="flex-shrink-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {credential.platform && (
                          <Badge variant="secondary">
                            <Cloud className="mr-1 h-3 w-3 flex-shrink-0" />
                            <span>{credential.platform.name}</span>
                          </Badge>
                        )}
                        {credential.machine && (
                          <Badge variant="outline">
                            <Server className="mr-1 h-3 w-3 flex-shrink-0" />
                            <span className="inline-block max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap" title={credential.machine.hostname}>
                              {credential.machine.hostname}
                            </span>
                          </Badge>
                        )}
                        {!credential.platform && !credential.machine && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/credentials/${credential.id}`)}
                          title={t('common.viewDetails')}
                        >
                          {t('common.details')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openModal(credential)}
                          title={t('common.edit')}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(credential.id)}
                          title={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-2xl">
        <ModalHeader onClose={() => setIsModalOpen(false)}>
          {editingCredential ? t('credentials.form.editTitle') : t('credentials.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Input
              label={t('credentials.form.nameLabel')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('credentials.form.namePlaceholder')}
            />

            <Select
              label={t('credentials.form.typeLabel')}
              options={availableTypeOptions}
              value={formData.type}
              onChange={(e) => handleTypeChange(e.target.value as CredentialType)}
            />

            {formData.type === 'LOGIN_PASSWORD' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('credentials.form.usernameLabel')}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <Input
                  label={editingCredential ? t('credentials.form.newPasswordLabel') : t('credentials.form.passwordLabel')}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={requiresSecret}
                />
              </div>
            )}

            {formData.type === 'API_TOKEN' && (
              <Input
                label={t('credentials.form.tokenLabel')}
                type="password"
                value={formData.token}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                required={requiresSecret}
              />
            )}

            {formData.type === 'CLIENT_SECRET' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('credentials.form.clientIdLabel')}
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  required={requiresSecret}
                />
                <Input
                  label={t('credentials.form.clientSecretLabel')}
                  type="password"
                  value={formData.clientSecret}
                  onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                  required={requiresSecret}
                />
              </div>
            )}

            <Input
              label={t('credentials.form.urlLabel')}
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder={t('credentials.form.urlPlaceholder')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={t('credentials.form.platformLabel')}
                options={platformOptions}
                value={formData.platformId}
                onChange={(e) => setFormData({ ...formData, platformId: e.target.value })}
              />
              <Select
                label={t('credentials.form.machineLabel')}
                options={machineOptions}
                value={formData.machineId}
                onChange={(e) => setFormData({ ...formData, machineId: e.target.value })}
              />
            </div>

            <Textarea
              label={t('credentials.form.notesLabel')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />

            {formError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {formError}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('credentials.form.cancel')}
            </Button>
            <Button type="submit">
              {editingCredential ? t('credentials.form.save') : t('credentials.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
