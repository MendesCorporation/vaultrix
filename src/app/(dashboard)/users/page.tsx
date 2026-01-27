'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Badge, Input } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Plus, Search, Edit, Trash2 } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import Link from 'next/link'
import { useLocale } from '@/components/providers/LocaleProvider'
import { localeTag } from '@/lib/i18n/locales'

interface User {
  id: string
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'USER'
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

interface Group {
  id: string
  name: string
}

export default function UsersPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t, locale } = useLocale()
  const dateLocale = localeTag(locale)
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [smtpConfigured, setSmtpConfigured] = useState(true)
  const [smtpLoading, setSmtpLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'USER' as 'ADMIN' | 'USER',
    groupIds: [] as string[],
  })

  const fetchUsers = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/users?search=${search}`)
      const data = await res.json()
      setUsers(data.data || [])
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setIsLoading(false)
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
    fetchUsers()
  }, [search])

  useEffect(() => {
    fetchGroups()
  }, [])

  const fetchSmtpStatus = async () => {
    setSmtpLoading(true)
    try {
      const res = await fetch('/api/system/smtp/status')
      if (!res.ok) {
        setSmtpConfigured(false)
        return
      }
      const data = await res.json()
      setSmtpConfigured(Boolean(data.configured))
    } catch (error) {
      console.error('Failed to fetch SMTP status:', error)
      setSmtpConfigured(false)
    } finally {
      setSmtpLoading(false)
    }
  }

  useEffect(() => {
    fetchSmtpStatus()
  }, [])

  useEffect(() => {
    if (formData.role === 'ADMIN' && formData.groupIds.length > 0) {
      setFormData((prev) => ({ ...prev, groupIds: [] }))
    }
  }, [formData.role])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const url = editingUser
        ? `/api/users/${editingUser.id}`
        : '/api/users'

      const payload = editingUser
        ? {
            name: formData.name,
            email: formData.email,
            role: formData.role,
          }
        : formData

      const res = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchUsers()
      } else {
        let message = t('common.saveError')
        try {
          const error = await res.json()
          message = error.error || message
        } catch {
          // ignore parse errors
        }
        toast.error(message)
      }
    } catch (error) {
      console.error('Failed to save user:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('users.confirmDeleteTitle'),
      description: t('users.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchUsers()
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: 'USER',
      groupIds: [],
    })
    setEditingUser(null)
  }

  const openModal = (user?: User) => {
    const isEditing = Boolean(user)
    if (isEditing && user) {
      setEditingUser(user)
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role === 'SUPER_ADMIN' ? 'ADMIN' : user.role,
        groupIds: [],
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
    if (!isEditing) {
      fetchSmtpStatus()
    }
  }

  const toggleGroup = (groupId: string) => {
    setFormData((prev) => {
      const exists = prev.groupIds.includes(groupId)
      const groupIds = exists
        ? prev.groupIds.filter((id) => id !== groupId)
        : [...prev.groupIds, groupId]
      return { ...prev, groupIds }
    })
  }

  const roleOptions = [
    { value: 'USER', label: t('users.roles.userLabel') },
    { value: 'ADMIN', label: t('users.roles.adminLabel') },
  ]

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <Badge className="bg-primary-500 text-white">{t('users.roles.superAdmin')}</Badge>
      case 'ADMIN':
        return <Badge variant="warning">{t('users.roles.admin')}</Badge>
      default:
        return <Badge variant="secondary">{t('users.roles.user')}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('users.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('users.new')}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <Input
          placeholder={t('users.searchPlaceholder')}
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
                  {t('users.table.user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('users.table.role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('users.table.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-dark-500">
                  {t('users.table.lastLogin')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-dark-500">
                  {t('users.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-dark-500">
                    {t('users.loading')}
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-dark-500">
                    {t('users.empty')}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-50 dark:hover:bg-dark-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-dark-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4">
                      {user.isActive ? (
                        <Badge variant="success">{t('common.active')}</Badge>
                      ) : (
                        <Badge variant="destructive">{t('common.inactive')}</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-dark-500">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString(dateLocale)
                        : t('users.never')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {user.role !== 'SUPER_ADMIN' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openModal(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(user.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
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
          {editingUser ? t('users.form.editTitle') : t('users.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Input
              label={t('users.form.nameLabel')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />

            <Input
              label={t('users.form.emailLabel')}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />

            <Select
              label={t('users.form.roleLabel')}
              options={roleOptions}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as 'ADMIN' | 'USER' })}
            />

            {!editingUser && (
              <div className="space-y-3">
                {!smtpConfigured && !smtpLoading && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {t('users.form.smtpMissing')}
                    <div className="mt-3">
                      <Link
                        href="/settings"
                        className="inline-flex h-8 items-center justify-center rounded-lg bg-dark-100 px-3 text-sm font-medium text-dark-900 transition-colors hover:bg-dark-200 dark:bg-dark-700 dark:text-white dark:hover:bg-dark-600"
                      >
                        {t('users.form.goToSettings')}
                      </Link>
                    </div>
                  </div>
                )}
                <div className="rounded-lg bg-dark-50 p-3 text-sm text-dark-600 dark:bg-dark-800/50 dark:text-dark-300">
                  {t('users.form.inviteHint')}
                </div>

                {formData.role === 'USER' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">{t('users.form.groupsLabel')}</label>
                    <div className="space-y-2">
                      {groups.length === 0 ? (
                        <p className="text-sm text-dark-500">{t('users.form.noGroups')}</p>
                      ) : (
                        groups.map((group) => (
                          <label
                            key={group.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-dark-200 p-3 text-sm dark:border-dark-700"
                          >
                            <span className="font-medium">{group.name}</span>
                            <input
                              type="checkbox"
                              checked={formData.groupIds.includes(group.id)}
                              onChange={() => toggleGroup(group.id)}
                              className="h-4 w-4"
                            />
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('users.form.cancel')}
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!editingUser && (!smtpConfigured || smtpLoading)}
            >
              {editingUser ? t('users.form.save') : t('users.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
