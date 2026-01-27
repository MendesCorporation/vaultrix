'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Plus, Search, Users, Edit, Trash2, UserPlus } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Group {
  id: string
  name: string
  description: string | null
  _count?: { users: number }
}

interface User {
  id: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  isActive: boolean
}

export default function GroupsPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })

  const fetchGroups = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/groups?search=${search}`)
      const data = await res.json()
      setGroups(data.data || [])
    } catch (error) {
      console.error('Failed to fetch groups:', error)
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
    fetchGroups()
    fetchUsers()
  }, [search])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingGroup ? `/api/groups/${editingGroup.id}` : '/api/groups'
      const res = await fetch(url, {
        method: editingGroup ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchGroups()
      } else {
        const error = await res.json()
        toast.error(error.error || t('groups.errors.save'))
      }
    } catch (error) {
      console.error('Failed to save group:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('groups.confirmDeleteTitle'),
      description: t('groups.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchGroups()
      } else {
        const error = await res.json()
        toast.error(error.error || t('groups.errors.delete'))
      }
    } catch (error) {
      console.error('Failed to delete group:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
    })
    setEditingGroup(null)
  }

  const openModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group)
      setFormData({
        name: group.name,
        description: group.description || '',
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const openMembersModal = async (group: Group) => {
    setSelectedGroup(group)
    setIsMembersModalOpen(true)

    try {
      const res = await fetch(`/api/groups/${group.id}`)
      const data = await res.json()
      const members = data.users || []
      setSelectedUserIds(members.map((ug: any) => ug.user.id))
    } catch (error) {
      console.error('Failed to fetch group members:', error)
    }
  }

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const saveMembers = async () => {
    if (!selectedGroup) return

    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: selectedUserIds }),
      })

      if (res.ok) {
        setIsMembersModalOpen(false)
        fetchGroups()
      } else {
        const error = await res.json()
        toast.error(error.error || t('groups.errors.saveMembers'))
      }
    } catch (error) {
      console.error('Failed to save members:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('groups.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('groups.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('groups.new')}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <Input
          placeholder={t('groups.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-200 dark:border-dark-700">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('groups.table.group')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('groups.table.members')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-dark-500">
                  {t('groups.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-dark-500">
                    {t('groups.loading')}
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-dark-500">
                    {t('groups.empty')}
                  </td>
                </tr>
              ) : (
                groups.map((group) => (
                  <tr key={group.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                          <Users className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <p className="font-medium">{group.name}</p>
                          {group.description && (
                            <p className="text-sm text-dark-500">{group.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary">
                        {t('groups.membersCount', { count: group._count?.users ?? 0 })}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openMembersModal(group)}
                          title={t('groups.manageMembers')}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openModal(group)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(group.id)}
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

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <ModalHeader onClose={() => setIsModalOpen(false)}>
          {editingGroup ? t('groups.form.editTitle') : t('groups.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Input
              label={t('groups.form.nameLabel')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label={t('groups.form.descriptionLabel')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('groups.form.cancel')}
            </Button>
            <Button type="submit">
              {editingGroup ? t('groups.form.save') : t('groups.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      <Modal open={isMembersModalOpen} onClose={() => setIsMembersModalOpen(false)} className="max-w-2xl">
        <ModalHeader onClose={() => setIsMembersModalOpen(false)}>
          {t('groups.membersModal.title')}
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            {users.map((user) => (
              <label key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-dark-200 p-3 dark:border-dark-700">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-dark-500">{user.email}</p>
                </div>
                <input
                  type="checkbox"
                  checked={selectedUserIds.includes(user.id)}
                  onChange={() => toggleMember(user.id)}
                  className="h-4 w-4"
                />
              </label>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={() => setIsMembersModalOpen(false)}>
            {t('groups.membersModal.cancel')}
          </Button>
          <Button type="button" onClick={saveMembers}>
            {t('groups.membersModal.save')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
