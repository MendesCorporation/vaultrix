'use client'

import { useState, useEffect } from 'react'
import { Button, Card, Badge, Input } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  Plus,
  Search,
  Cloud,
  Image as ImageIcon,
  Edit,
  Trash2,
  Key
} from 'lucide-react'

interface Platform {
  id: string
  name: string
  logoUrl: string | null
  category: string | null
  description: string | null
  supportsLogin?: boolean
  supportsApiToken?: boolean
  supportsClientSecret?: boolean
  isProvider?: boolean
  createdAt: string
  _count: { credentials: number }
}

export default function PlatformsPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [logoPreviewError, setLogoPreviewError] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    logoUrl: '',
    category: '',
    description: '',
    supportsLogin: true,
    supportsApiToken: false,
    supportsClientSecret: false,
    isProvider: false,
  })

  const fetchPlatforms = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/platforms?search=${search}`)
      const data = await res.json()
      setPlatforms(data.data || [])
    } catch (error) {
      console.error('Failed to fetch platforms:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPlatforms()
  }, [search])

  useEffect(() => {
    setLogoPreviewError(false)
  }, [formData.logoUrl])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!formData.supportsLogin && !formData.supportsApiToken && !formData.supportsClientSecret) {
        toast.error(t('platforms.errors.authRequired'))
        return
      }

      const url = editingPlatform
        ? `/api/platforms/${editingPlatform.id}`
        : '/api/platforms'

      const res = await fetch(url, {
        method: editingPlatform ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchPlatforms()
      } else {
        const error = await res.json()
        toast.error(error.error || t('platforms.errors.save'))
      }
    } catch (error) {
      console.error('Failed to save platform:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('platforms.confirmDeleteTitle'),
      description: t('platforms.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/platforms/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPlatforms()
      } else {
        const error = await res.json()
        toast.error(error.error || t('platforms.errors.delete'))
      }
    } catch (error) {
      console.error('Failed to delete platform:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      logoUrl: '',
      category: '',
      description: '',
      supportsLogin: true,
      supportsApiToken: false,
      supportsClientSecret: false,
      isProvider: false,
    })
    setEditingPlatform(null)
    setUploadError('')
    setLogoPreviewError(false)
  }

  const openModal = (platform?: Platform) => {
    if (platform) {
      setEditingPlatform(platform)
      setFormData({
        name: platform.name,
        logoUrl: platform.logoUrl || '',
        category: platform.category || '',
        description: platform.description || '',
        supportsLogin: platform.supportsLogin ?? true,
        supportsApiToken: platform.supportsApiToken ?? false,
        supportsClientSecret: platform.supportsClientSecret ?? false,
        isProvider: platform.isProvider ?? false,
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleLogoUpload = async (file: File) => {
    setUploadError('')
    setIsUploading(true)

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch('/api/platforms/logo', {
        method: 'POST',
        body,
      })

      if (!res.ok) {
        const error = await res.json()
        setUploadError(error.error || t('platforms.errors.uploadLogo'))
        return
      }

      const data = await res.json()
      setFormData((prev) => ({ ...prev, logoUrl: data.url }))
      setLogoPreviewError(false)
    } catch (error) {
      console.error('Failed to upload logo:', error)
      setUploadError(t('platforms.errors.uploadLogo'))
    } finally {
      setIsUploading(false)
    }
  }

  const categories = ['Cloud', 'Database', 'DevOps', 'Monitoring', 'Security', 'AI', 'Other']
  const categoryLabels: Record<string, string> = {
    Cloud: t('platforms.categories.cloud'),
    Database: t('platforms.categories.database'),
    DevOps: t('platforms.categories.devops'),
    Monitoring: t('platforms.categories.monitoring'),
    Security: t('platforms.categories.security'),
    AI: t('platforms.categories.ai'),
    Other: t('platforms.categories.other'),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('platforms.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('platforms.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('platforms.new')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <Input
          placeholder={t('platforms.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center text-dark-500">{t('platforms.loading')}</div>
      ) : platforms.length === 0 ? (
        <Card className="p-8 text-center">
          <Cloud className="mx-auto h-12 w-12 text-dark-300" />
          <p className="mt-4 text-dark-500">{t('platforms.empty')}</p>
          <Button className="mt-4" onClick={() => openModal()}>
            <Plus className="mr-2 h-4 w-4" />
            {t('platforms.emptyAction')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {platforms.map((platform) => (
            <Card key={platform.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center bg-dark-100 dark:bg-dark-700">
                {platform.logoUrl ? (
                  <img
                    src={platform.logoUrl}
                    alt={platform.name}
                    className="h-16 w-16 object-contain"
                  />
                ) : (
                  <Cloud className="h-16 w-16 text-dark-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{platform.name}</h3>
                    {platform.category && (
                      <Badge variant="secondary" className="mt-1">
                        {categoryLabels[platform.category] || platform.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-dark-500">
                    <Key className="h-4 w-4" />
                    <span className="text-sm">{platform._count.credentials}</span>
                  </div>
                </div>
                {platform.description && (
                  <p className="mt-2 text-sm text-dark-500 line-clamp-2">
                    {platform.description}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => openModal(platform)}
                    >
                      <Edit className="mr-1 h-3 w-3" />
                      {t('platforms.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(platform.id)}
                      disabled={platform._count.credentials > 0}
                      title={platform._count.credentials > 0 ? t('platforms.deleteDisabled') : t('common.delete')}
                    >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <ModalHeader onClose={() => setIsModalOpen(false)}>
          {editingPlatform ? t('platforms.form.editTitle') : t('platforms.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Input
              label={t('platforms.form.nameLabel')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('platforms.form.namePlaceholder')}
            />

            {formData.logoUrl && (
              <div className="flex justify-center rounded-lg bg-dark-100 p-4 dark:bg-dark-700">
                {!logoPreviewError ? (
                  <img
                    src={formData.logoUrl}
                    alt="Preview"
                    className="h-16 w-16 object-contain"
                    onError={() => setLogoPreviewError(true)}
                  />
                ) : (
                  <ImageIcon className="h-10 w-10 text-dark-400" />
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('platforms.form.uploadLogo')}</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="block w-full text-sm text-dark-500 file:mr-4 file:rounded-md file:border-0 file:bg-dark-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-dark-600 hover:file:bg-dark-200 dark:file:bg-dark-700 dark:file:text-dark-200"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(file)
                }}
              />
              {isUploading && (
                <p className="text-sm text-dark-500">{t('platforms.form.uploadingLogo')}</p>
              )}
              {uploadError && (
                <p className="text-sm text-red-500">{uploadError}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t('platforms.form.categoryLabel')}</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat })}
                    className={`rounded-full px-3 py-1 text-sm transition-colors ${
                      formData.category === cat
                        ? 'bg-primary-500 text-white'
                        : 'bg-dark-100 text-dark-600 hover:bg-dark-200 dark:bg-dark-700 dark:text-dark-300'
                    }`}
                  >
                    {categoryLabels[cat] || cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('platforms.form.authLabel')}</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.supportsLogin}
                    onChange={(e) => setFormData({ ...formData, supportsLogin: e.target.checked })}
                  />
                  {t('platforms.form.authLogin')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.supportsApiToken}
                    onChange={(e) => setFormData({ ...formData, supportsApiToken: e.target.checked })}
                  />
                  {t('platforms.form.authApiToken')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.supportsClientSecret}
                    onChange={(e) => setFormData({ ...formData, supportsClientSecret: e.target.checked })}
                  />
                  {t('platforms.form.authClientSecret')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formData.isProvider}
                    onChange={(e) => setFormData({ ...formData, isProvider: e.target.checked })}
                  />
                  {t('platforms.form.isProviderLabel')}
                </label>
              </div>
              <p className="text-xs text-dark-500">{t('platforms.form.authHint')}</p>
            </div>

            <Textarea
              label={t('platforms.form.descriptionLabel')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('platforms.form.cancel')}
            </Button>
            <Button type="submit">
              {editingPlatform ? t('platforms.form.save') : t('platforms.form.create')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  )
}
