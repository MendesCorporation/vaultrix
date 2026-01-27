'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { useLocale } from '@/components/providers/LocaleProvider'

interface InviteFormProps {
  token: string
  name: string
  email: string
}

export function InviteForm({ token, name, email }: InviteFormProps) {
  const router = useRouter()
  const { t } = useLocale()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError(t('invite.passwordMin'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('invite.passwordMismatch'))
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('invite.acceptError'))
        return
      }

      setSuccess(true)
    } catch (err) {
      setError(t('invite.acceptError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('invite.title')}</CardTitle>
        <CardDescription>
          {t('invite.subtitle', { name })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-dark-500">{t('invite.success')}</p>
            <Button onClick={() => router.push('/login')}>{t('invite.goToLogin')}</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <Input label={t('invite.emailLabel')} value={email} disabled />
            <Input
              label={t('invite.passwordLabel')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label={t('invite.confirmPasswordLabel')}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              {t('invite.submit')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
