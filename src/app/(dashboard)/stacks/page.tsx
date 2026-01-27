'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Input, Badge } from '@/components/ui'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Plus, Search, Layers, Edit, Trash2, Image as ImageIcon, Rocket, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import { useConfirm } from '@/components/providers/ConfirmProvider'
import { useLocale } from '@/components/providers/LocaleProvider'

interface Stack {
  id: string
  name: string
  imageUrl: string | null
  env: string | null
  dockerCompose: string | null
  instructions: string | null
  mode: string
  createdAt: string
}

interface Machine {
  id: string
  hostname: string
  ip: string | null
}

type DeployStep = 'idle' | 'connecting' | 'creating_folder' | 'creating_env' | 'creating_compose' | 'pulling' | 'starting' | 'verifying' | 'success' | 'error'

export default function StacksPage() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { t } = useLocale()
  const [stacks, setStacks] = useState<Stack[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStack, setEditingStack] = useState<Stack | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [previewError, setPreviewError] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    imageUrl: '',
    env: '',
    dockerCompose: '',
    instructions: '',
    mode: 'manual' as 'manual' | 'automatic',
  })

  // Deploy states
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [deployingStack, setDeployingStack] = useState<Stack | null>(null)
  const [machines, setMachines] = useState<Machine[]>([])
  const [deployForm, setDeployForm] = useState({
    machineId: '',
    folderName: '',
    env: '',
    dockerCompose: '',
  })
  const [deployStep, setDeployStep] = useState<DeployStep>('idle')
  const [deployLogs, setDeployLogs] = useState('')
  const [deployError, setDeployError] = useState('')

  const fetchStacks = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/stacks?search=${search}`)
      const data = await res.json()
      setStacks(data.data || [])
    } catch (error) {
      console.error('Failed to fetch stacks:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchMachines = async () => {
    try {
      const res = await fetch('/api/machines?limit=100')
      const data = await res.json()
      setMachines(data.data || [])
    } catch (error) {
      console.error('Failed to fetch machines:', error)
    }
  }

  const openDeployModal = (stack: Stack) => {
    setDeployingStack(stack)
    setDeployForm({
      machineId: '',
      folderName: stack.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      env: stack.env || '',
      dockerCompose: stack.dockerCompose || '',
    })
    setDeployStep('idle')
    setDeployLogs('')
    setDeployError('')
    fetchMachines()
    setIsDeployModalOpen(true)
  }

  const handleDeploy = async () => {
    if (!deployingStack || !deployForm.machineId || !deployForm.folderName) {
      toast.error(t('stacks.deploy.errors.required'))
      return
    }

    setDeployStep('connecting')
    setDeployError('')

    try {
      const res = await fetch(`/api/stacks/${deployingStack.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deployForm),
      })

      const data = await res.json()

      if (res.ok) {
        setDeployStep('success')
        setDeployLogs(data.logs || '')
        toast.success(t('stacks.deploy.success'))
      } else {
        setDeployStep('error')
        setDeployError(data.error || t('stacks.deploy.errors.failed'))
        setDeployLogs(data.logs || '')
      }
    } catch (error) {
      console.error('Deploy failed:', error)
      setDeployStep('error')
      setDeployError(t('stacks.deploy.errors.failed'))
    }
  }

  useEffect(() => {
    fetchStacks()
  }, [search])

  useEffect(() => {
    setPreviewError(false)
  }, [formData.imageUrl])

  const handleImageUpload = async (file: File) => {
    setUploadError('')
    setIsUploading(true)

    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch('/api/stacks/image', {
        method: 'POST',
        body,
      })

      if (!res.ok) {
        const error = await res.json()
        setUploadError(error.error || t('stacks.errors.upload'))
        return
      }

      const data = await res.json()
      setFormData((prev) => ({ ...prev, imageUrl: data.url }))
      setPreviewError(false)
    } catch (error) {
      console.error('Failed to upload stack image:', error)
      setUploadError(t('stacks.errors.upload'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = editingStack ? `/api/stacks/${editingStack.id}` : '/api/stacks'
      const res = await fetch(url, {
        method: editingStack ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setIsModalOpen(false)
        resetForm()
        fetchStacks()
      } else {
        const error = await res.json()
        toast.error(error.error || t('stacks.errors.save'))
      }
    } catch (error) {
      console.error('Failed to save stack:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const accepted = await confirm({
      title: t('stacks.confirmDeleteTitle'),
      description: t('stacks.confirmDeleteDescription'),
      confirmText: t('common.delete'),
      variant: 'danger',
    })
    if (!accepted) return

    try {
      const res = await fetch(`/api/stacks/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchStacks()
      } else {
        const error = await res.json()
        toast.error(error.error || t('stacks.errors.delete'))
      }
    } catch (error) {
      console.error('Failed to delete stack:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      imageUrl: '',
      env: '',
      dockerCompose: '',
      instructions: '',
      mode: 'manual',
    })
    setEditingStack(null)
    setUploadError('')
    setPreviewError(false)
  }

  const openModal = (stack?: Stack) => {
    if (stack) {
      setEditingStack(stack)
      setFormData({
        name: stack.name,
        imageUrl: stack.imageUrl || '',
        env: stack.env || '',
        dockerCompose: stack.dockerCompose || '',
        instructions: stack.instructions || '',
        mode: (stack.mode as 'manual' | 'automatic') || 'manual',
      })
    } else {
      resetForm()
    }
    setIsModalOpen(true)
  }

  const countLines = (value?: string | null) => {
    if (!value) return 0
    return value.split('\n').filter((line) => line.trim().length > 0).length
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('stacks.title')}</h1>
          <p className="text-dark-500 dark:text-dark-400">
            {t('stacks.subtitle')}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus className="mr-2 h-4 w-4" />
          {t('stacks.new')}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
        <Input
          placeholder={t('stacks.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-dark-500">{t('stacks.loading')}</div>
      ) : stacks.length === 0 ? (
        <Card className="p-8 text-center">
          <Layers className="mx-auto h-12 w-12 text-dark-300" />
          <p className="mt-4 text-dark-500">{t('stacks.empty')}</p>
          <Button className="mt-4" onClick={() => openModal()}>
            <Plus className="mr-2 h-4 w-4" />
            {t('stacks.emptyAction')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {stacks.map((stack) => (
            <Card key={stack.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center bg-dark-100 dark:bg-dark-700">
                {stack.imageUrl ? (
                  <img src={stack.imageUrl} alt={stack.name} className="h-16 w-16 object-contain" />
                ) : (
                  <ImageIcon className="h-10 w-10 text-dark-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{stack.name}</h3>
                      <Badge variant={stack.mode === 'automatic' ? 'default' : 'secondary'}>
                        {stack.mode === 'automatic' ? t('stacks.modeAutomatic') : t('stacks.modeManual')}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-dark-500">
                      <Badge variant="secondary">{t('stacks.counts.env')}: {countLines(stack.env)}</Badge>
                      <Badge variant="secondary">{t('stacks.counts.compose')}: {countLines(stack.dockerCompose)}</Badge>
                    </div>
                  </div>
                </div>
                {stack.instructions && (
                  <p className="mt-3 text-sm text-dark-500 line-clamp-2">
                    {stack.instructions}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  {stack.mode === 'automatic' && (
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => openDeployModal(stack)}
                    >
                      <Rocket className="mr-1 h-3 w-3" />
                      {t('stacks.deploy.button')}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className={stack.mode === 'automatic' ? '' : 'flex-1'}
                    onClick={() => openModal(stack)}
                  >
                    <Edit className="mr-1 h-3 w-3" />
                    {t('stacks.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(stack.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Criação/Edição */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} className="max-w-3xl">
        <ModalHeader onClose={() => setIsModalOpen(false)}>
          {editingStack ? t('stacks.form.editTitle') : t('stacks.form.createTitle')}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <Input
              label={t('stacks.form.nameLabel')}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder={t('stacks.form.namePlaceholder')}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('stacks.form.imageLabel')}</label>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-dark-100 dark:bg-dark-700">
                  {formData.imageUrl && !previewError ? (
                    <img
                      src={formData.imageUrl}
                      alt="Preview"
                      className="h-12 w-12 object-contain"
                      onError={() => setPreviewError(true)}
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-dark-400" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="block w-full text-sm text-dark-500 file:mr-4 file:rounded-md file:border-0 file:bg-dark-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-dark-600 hover:file:bg-dark-200 dark:file:bg-dark-700 dark:file:text-dark-200"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(file)
                  }}
                />
              </div>
              {isUploading && (
                <p className="text-sm text-dark-500">{t('stacks.form.uploadingImage')}</p>
              )}
              {uploadError && (
                <p className="text-sm text-red-500">{uploadError}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">{t('stacks.form.modeLabel')}</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="manual"
                    checked={formData.mode === 'manual'}
                    onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'manual' | 'automatic' })}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-500"
                  />
                  <span>{t('stacks.modeManual')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="automatic"
                    checked={formData.mode === 'automatic'}
                    onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'manual' | 'automatic' })}
                    className="h-4 w-4 text-primary-500 focus:ring-primary-500"
                  />
                  <span>{t('stacks.modeAutomatic')}</span>
                </label>
              </div>
              <p className="text-xs text-dark-500">{t('stacks.form.modeHint')}</p>
            </div>

            <Textarea
              label={t('stacks.form.envLabel')}
              value={formData.env}
              onChange={(e) => setFormData({ ...formData, env: e.target.value })}
              placeholder={t('stacks.form.envPlaceholder')}
              rows={6}
            />

            <Textarea
              label={t('stacks.form.composeLabel')}
              value={formData.dockerCompose}
              onChange={(e) => setFormData({ ...formData, dockerCompose: e.target.value })}
              placeholder={t('stacks.form.composePlaceholder')}
              rows={8}
            />

            <Textarea
              label={t('stacks.form.instructionsLabel')}
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder={t('stacks.form.instructionsPlaceholder')}
              rows={6}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              {t('stacks.form.cancel')}
            </Button>
            <Button type="submit">{editingStack ? t('stacks.form.save') : t('stacks.form.create')}</Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal de Deploy */}
      <Modal open={isDeployModalOpen} onClose={() => setIsDeployModalOpen(false)} className="max-w-3xl">
        <ModalHeader onClose={() => setIsDeployModalOpen(false)}>
          {t('stacks.deploy.title')}: {deployingStack?.name}
        </ModalHeader>
        <ModalBody>
          {deployStep === 'idle' ? (
            <div className="space-y-4">
              <Input
                label={t('stacks.deploy.folderName')}
                value={deployForm.folderName}
                onChange={(e) => setDeployForm({ ...deployForm, folderName: e.target.value })}
                required
                placeholder="my-stack"
              />

              <div className="space-y-2">
                <label className="block text-sm font-medium">{t('stacks.deploy.machine')}</label>
                <select
                  value={deployForm.machineId}
                  onChange={(e) => setDeployForm({ ...deployForm, machineId: e.target.value })}
                  className="w-full rounded-lg border border-dark-200 bg-white px-3 py-2 text-dark-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-800 dark:text-dark-100"
                  required
                >
                  <option value="">{t('stacks.deploy.selectMachine')}</option>
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.hostname} {machine.ip ? `(${machine.ip})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <Textarea
                label={t('stacks.deploy.env')}
                value={deployForm.env}
                onChange={(e) => setDeployForm({ ...deployForm, env: e.target.value })}
                placeholder="POSTGRES_PASSWORD=secret"
                rows={6}
              />

              <Textarea
                label={t('stacks.deploy.dockerCompose')}
                value={deployForm.dockerCompose}
                onChange={(e) => setDeployForm({ ...deployForm, dockerCompose: e.target.value })}
                placeholder="version: '3.9'"
                rows={8}
                required
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <DeployStepItem
                  step="connecting"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.connecting')}
                />
                <DeployStepItem
                  step="creating_folder"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.creatingFolder')}
                />
                <DeployStepItem
                  step="creating_env"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.creatingEnv')}
                />
                <DeployStepItem
                  step="creating_compose"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.creatingCompose')}
                />
                <DeployStepItem
                  step="pulling"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.pulling')}
                />
                <DeployStepItem
                  step="starting"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.starting')}
                />
                <DeployStepItem
                  step="verifying"
                  currentStep={deployStep}
                  label={t('stacks.deploy.steps.verifying')}
                />
              </div>

              {deployStep === 'success' && (
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">{t('stacks.deploy.success')}</span>
                  </div>
                </div>
              )}

              {deployStep === 'error' && (
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">{deployError}</span>
                  </div>
                </div>
              )}

              {deployLogs && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">{t('stacks.deploy.logs')}</label>
                  <pre className="max-h-60 overflow-auto rounded-lg bg-gray-900 p-4 text-xs font-mono text-green-400 dark:bg-black">
                    {deployLogs}
                  </pre>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsDeployModalOpen(false)}>
            {deployStep === 'success' || deployStep === 'error' ? t('common.close') : t('stacks.form.cancel')}
          </Button>
          {deployStep === 'idle' && (
            <Button onClick={handleDeploy}>
              <Rocket className="mr-2 h-4 w-4" />
              {t('stacks.deploy.button')}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </div>
  )
}

function DeployStepItem({ step, currentStep, label }: { step: DeployStep; currentStep: DeployStep; label: string }) {
  const steps: DeployStep[] = ['connecting', 'creating_folder', 'creating_env', 'creating_compose', 'pulling', 'starting', 'verifying']
  const stepIndex = steps.indexOf(step)
  const currentIndex = steps.indexOf(currentStep)

  const isCompleted = currentStep === 'success' || (currentIndex > stepIndex && currentStep !== 'error')
  const isActive = currentStep === step
  const isError = currentStep === 'error' && currentIndex === stepIndex

  return (
    <div className="flex items-center gap-3">
      {isCompleted ? (
        <CheckCircle2 className="h-5 w-5 text-green-500" />
      ) : isActive ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
      ) : isError ? (
        <XCircle className="h-5 w-5 text-red-500" />
      ) : (
        <Circle className="h-5 w-5 text-dark-300" />
      )}
      <span className={isActive ? 'font-medium' : isCompleted ? 'text-dark-500' : 'text-dark-400'}>
        {label}
      </span>
    </div>
  )
}
