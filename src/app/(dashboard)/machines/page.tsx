'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Badge, Input } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  Plus,
  Search,
  Server,
  Edit,
  Trash2,
  Eye,
  Key,
  Share2
} from 'lucide-react'

interface Machine {
  id: string
  hostname: string
  ip: string | null
  description: string | null
  os: string | null
  osVersion: string | null
  sshPort: number
  tags: string[]
  createdAt: string
  createdBy: { name: string }
  provider?: { id: string; name: string } | null
  _count: { credentials: number }
}

interface Provider {
  id: string
  name: string
}

interface Group {
  id: string
  name: string
}

interface Permission {
  id: string
  actions: Array<'CREATE' | 'READ' | 'UPDATE' | 'DELETE'>
  group?: { id: string; name: string } | null
}

export default function MachinesPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const router = useRouter()
  const [machines, setMachines] = useState<Machine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<Machine | null>(null)
  const [shareGroupId, setShareGroupId] = useState('')
  const [shareActions, setShareActions] = useState<Array<'READ' | 'UPDATE' | 'DELETE'>>([])
  const [resourcePermissions, setResourcePermissions] = useState<Permission[]>([])

  const [formData, setFormData] = useState({
    hostname: '',
    ip: '',
    description: '',
    os: '',
    osVersion: '',
    providerId: '',
    username: '',
    password: '',
    sshKey: '',
    sshPort: 22,
    notes: '',
  })

  const parseOsValues = (os: string, osVersion?: string | null) => {
    if (osVersion) {
      return { os, osVersion }
    }

    const trimmed = os.trim()
    if (!trimmed) {
      return { os: '', osVersion: '' }
    }

    const parts = trimmed.split(' ')
    if (parts.length > 1) {
      const last = parts[parts.length - 1]
      if (/\d/.test(last)) {
        return {
          os: parts.slice(0, -1).join(' '),
          osVersion: last,
        }
      }
    }

    return { os: trimmed, osVersion: '' }
  }

  const fetchMachines = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/machines?search=${search}`)
      const data = await res.json()
      setMachines(data.data || [])
    } catch (error) {
      console.error('Failed to fetch machines:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers?all=true')
      const data = await res.json()
      setProviders(data.data || [])
    } catch (error) {
      console.error('Failed to fetch providers:', error)
    }
  }

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      setGroups(data.data || [])
    } catch (error) {
      console.error('Failed to fetch groups:', error)
    }
  }

  useEffect(() => {
    fetchMachines()
    fetchProviders()
    fetchGroups()
  }, [search])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingMachine
        ? `/api/machines/${editingMachine.id}`
        : '/api/machines'

      const res = await fetch(url, {
        method: editingMachine ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          providerId: formData.providerId || null,
          osVersion: formData.osVersion || undefined,
        }),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchMachines()
      } else {
        const error = await res.json()
        toast.error(error.error || t('machines.errors.save'))
      }
    } catch (error) {
      console.error('Failed to save machine:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('machines.confirmDeleteTitle'),
      description: t('machines.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/machines/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchMachines()
      }
    } catch (error) {
      console.error('Failed to delete machine:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      hostname: '',
      ip: '',
      description: '',
      os: '',
      osVersion: '',
      providerId: '',
      username: '',
      password: '',
      sshKey: '',
      sshPort: 22,
      notes: '',
    })
    setEditingMachine(null)
  }

  const openModal = (machine?: Machine) => {
    if (machine) {
      const parsedOs = parseOsValues(machine.os || '', machine.osVersion)
      setEditingMachine(machine)
      setFormData({
        hostname: machine.hostname,
        ip: machine.ip || '',
        description: machine.description || '',
        os: parsedOs.os,
        osVersion: parsedOs.osVersion,
        providerId: machine.provider?.id || '',
        username: '',
        password: '',
        sshKey: '',
        sshPort: machine.sshPort,
        notes: '',
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const osOptions = [
    { value: '', label: t('machines.selectOs') },
    { value: 'Ubuntu|24.04', label: 'Ubuntu 24.04' },
    { value: 'Ubuntu|22.04', label: 'Ubuntu 22.04' },
    { value: 'Ubuntu|20.04', label: 'Ubuntu 20.04' },
    { value: 'Debian|12', label: 'Debian 12' },
    { value: 'Debian|11', label: 'Debian 11' },
    { value: 'CentOS|9', label: 'CentOS 9' },
    { value: 'CentOS|8', label: 'CentOS 8' },
    { value: 'RHEL|9', label: 'Red Hat Enterprise Linux 9' },
    { value: 'RHEL|8', label: 'Red Hat Enterprise Linux 8' },
    { value: 'Windows Server|2022', label: 'Windows Server 2022' },
    { value: 'Windows Server|2019', label: 'Windows Server 2019' },
    { value: 'Outro|', label: t('machines.osOther') },
  ]

  const providerOptions = [
    { value: '', label: t('machines.selectProvider') },
    ...providers.map((provider) => ({
      value: provider.id,
      label: provider.name,
    })),
  ]

  const groupOptions = [
    { value: '', label: t('machines.selectGroup') },
    ...groups.map((group) => ({
      value: group.id,
      label: group.name,
    })),
  ]


  const handleSshKeyUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : ''
      setFormData((prev) => ({ ...prev, sshKey: content }))
    }
    reader.readAsText(file)
  }

  const openShareModal = async (machine: Machine) => {
    setShareTarget(machine)
    setIsShareModalOpen(true)
    setShareGroupId('')
    setShareActions([])

    try {
      const res = await fetch(`/api/permissions?resourceType=MACHINE&resourceId=${machine.id}`)
      const data = await res.json()
      setResourcePermissions(data.data || [])
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
    }
  }

  const handleShareGroupChange = (groupId: string) => {
    setShareGroupId(groupId)
    const existing = resourcePermissions.find((p) => p.group?.id === groupId)
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
    if (!shareTarget || !shareGroupId) return

    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: shareGroupId,
          resourceType: 'MACHINE',
          resourceId: shareTarget.id,
          actions: shareActions,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || t('machines.errors.share'))
        return
      }

      setIsShareModalOpen(false)
      toast.success(t('machines.shareSuccess'))
    } catch (error) {
      console.error('Failed to save share:', error)
    }
  }

  // Filter machines by search and provider
  const filteredMachines = machines.filter((machine) => {
    const matchesSearch = !search ||
      machine.hostname.toLowerCase().includes(search.toLowerCase()) ||
      machine.ip?.toLowerCase().includes(search.toLowerCase()) ||
      machine.description?.toLowerCase().includes(search.toLowerCase())

    const matchesProvider = !providerFilter || machine.provider?.id === providerFilter

    return matchesSearch && matchesProvider
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('machines.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('machines.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('machines.new')}
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
          <Input
            placeholder={t('machines.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-48">
          <Select
            options={[
              { value: '', label: t('machines.allProviders') },
              ...providers.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            placeholder={t('machines.filterProvider')}
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
                  {t('machines.table.hostname')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('machines.table.ip')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('machines.table.os')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('machines.table.credentials')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('machines.table.createdBy')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-dark-500">
                  {t('machines.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-dark-500">
                    {t('machines.loading')}
                  </td>
                </tr>
              ) : filteredMachines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-dark-500">
                    {t('machines.empty')}
                  </td>
                </tr>
              ) : (
                filteredMachines.map((machine) => (
                  <tr key={machine.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium">{machine.hostname}</p>
                          {machine.description && (
                            <p className="text-sm text-dark-500">{machine.description}</p>
                          )}
                          {machine.provider?.name && (
                            <p className="text-xs text-dark-400">{t('machines.providerLabel')}: {machine.provider.name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm">
                      {machine.ip || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {machine.os ? (
                        <Badge variant="secondary">
                          {machine.osVersion ? `${machine.os} ${machine.osVersion}` : machine.os}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Key className="h-4 w-4 text-dark-400" />
                        <span>{machine._count.credentials}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-dark-500">
                      {machine.createdBy.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/machines/${machine.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openModal(machine)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openShareModal(machine)}
                          title={t('common.share')}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(machine.id)}
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
          {editingMachine ? t('machines.form.editTitle') : t('machines.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={t('machines.form.hostnameLabel')}
                value={formData.hostname}
                onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                required
              />
              <Input
                label={t('machines.form.ipLabel')}
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                placeholder="192.168.1.1"
              />
              <Select
                label={t('machines.form.osLabel')}
                options={osOptions}
                value={formData.os ? `${formData.os}|${formData.osVersion || ''}` : ''}
                onChange={(e) => {
                  const [os, version] = e.target.value.split('|')
                  setFormData({
                    ...formData,
                    os,
                    osVersion: version || '',
                  })
                }}
              />
              <Input
                label={t('machines.form.sshPortLabel')}
                type="number"
                value={formData.sshPort}
                onChange={(e) => setFormData({ ...formData, sshPort: parseInt(e.target.value) })}
              />
              <div className="space-y-2">
                <Select
                  label={t('machines.form.providerLabel')}
                  options={providerOptions}
                  value={formData.providerId}
                  onChange={(e) => setFormData({ ...formData, providerId: e.target.value })}
                />
              </div>
            </div>

            <Input
              label={t('machines.form.descriptionLabel')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />

            <div className="border-t border-dark-200 pt-4 dark:border-dark-700">
              <h3 className="mb-3 font-medium">{t('machines.form.accessTitle')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t('machines.form.userLabel')}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
                <Input
                  label={t('machines.form.passwordLabel')}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="mt-2">
                <label className="mb-1.5 block text-sm font-medium">{t('machines.form.uploadSsh')}</label>
                <input
                  type="file"
                  accept=".pem,.key,.pub,.txt"
                  className="block w-full text-sm text-dark-500 file:mr-4 file:rounded-md file:border-0 file:bg-dark-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-dark-600 hover:file:bg-dark-200 dark:file:bg-dark-700 dark:file:text-dark-200"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleSshKeyUpload(file)
                  }}
                />
              </div>
              <Textarea
                label={t('machines.form.sshKeyLabel')}
                value={formData.sshKey}
                onChange={(e) => setFormData({ ...formData, sshKey: e.target.value })}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="mt-4 font-mono text-xs"
              />
            </div>

            <Textarea
              label={t('machines.form.notesLabel')}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('machines.form.cancel')}
            </Button>
            <Button type="submit">
              {editingMachine ? t('machines.form.save') : t('machines.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>


      <Modal open={isShareModalOpen} onClose={() => setIsShareModalOpen(false)}>
        <ModalHeader onClose={() => setIsShareModalOpen(false)}>
          {t('machines.shareModal.title')}
        </ModalHeader>
        <ModalBody>
          <Select
            label={t('machines.shareModal.groupLabel')}
            options={groupOptions}
            value={shareGroupId}
            onChange={(e) => handleShareGroupChange(e.target.value)}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('machines.shareModal.permissionsLabel')}</label>
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
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={() => setIsShareModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={saveShare}>
            {t('machines.shareModal.save')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
