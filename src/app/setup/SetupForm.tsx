'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { useLocale } from '@/components/providers/LocaleProvider'

export function SetupForm() {
  const { t } = useLocale()
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password.length < 8) {
      setError(t('setup.passwordMin'))
      return
    }

    if (form.password !== form.confirmPassword) {
      setError(t('setup.passwordMismatch'))
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/system/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('setup.submitError'))
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(t('setup.submitError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('setup.title')}</CardTitle>
        <CardDescription>
          {t('setup.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <Input
            label={t('setup.nameLabel')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label={t('setup.emailLabel')}
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={t('setup.passwordLabel')}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Input
            label={t('setup.confirmPasswordLabel')}
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
          />

          <Button type="submit" className="w-full" isLoading={isLoading}>
            {t('setup.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
