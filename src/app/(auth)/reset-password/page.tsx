'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { KeyRound, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { t } = useLocale()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [isTokenValid, setIsTokenValid] = useState(false)

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false)
        return
      }

      try {
        const res = await fetch(`/api/auth/reset-password?token=${token}`)
        const data = await res.json()
        setIsTokenValid(data.valid)
      } catch {
        setIsTokenValid(false)
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'))
      return
    }

    if (password.length < 8) {
      setError(t('resetPassword.passwordTooShort'))
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      if (res.status === 429) {
        setError(t('resetPassword.tooManyAttempts'))
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('resetPassword.genericError'))
        return
      }

      setIsSuccess(true)
    } catch (err) {
      setError(t('resetPassword.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 dark:bg-dark-900">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <p className="text-center text-dark-500">{t('common.loading')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!token || !isTokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 dark:bg-dark-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <CardTitle className="text-2xl">{t('resetPassword.invalidTokenTitle')}</CardTitle>
            <CardDescription>{t('resetPassword.invalidTokenDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full">
                {t('resetPassword.requestNewLink')}
              </Button>
            </Link>
            <Link href="/login" className="mt-3 block">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('resetPassword.backToLogin')}
              </Button>
            </Link>
          </CardContent>
          <div className="pb-4 text-center">
            <a
              href="https://apptrix.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dark-400 hover:text-dark-600 dark:text-dark-500 dark:hover:text-dark-300 transition-colors"
            >
              Powered by Apptrix
            </a>
          </div>
        </Card>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 dark:bg-dark-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">{t('resetPassword.successTitle')}</CardTitle>
            <CardDescription>{t('resetPassword.successDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">
                {t('resetPassword.goToLogin')}
              </Button>
            </Link>
          </CardContent>
          <div className="pb-4 text-center">
            <a
              href="https://apptrix.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dark-400 hover:text-dark-600 dark:text-dark-500 dark:hover:text-dark-300 transition-colors"
            >
              Powered by Apptrix
            </a>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 dark:bg-dark-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
            <KeyRound className="h-8 w-8 text-primary-500" />
          </div>
          <CardTitle className="text-2xl">{t('resetPassword.title')}</CardTitle>
          <CardDescription>{t('resetPassword.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('resetPassword.newPassword')}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <Input
              label={t('resetPassword.confirmPassword')}
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <KeyRound className="mr-2 h-4 w-4" />
              {t('resetPassword.submit')}
            </Button>

            <Link href="/login">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('resetPassword.backToLogin')}
              </Button>
            </Link>
          </form>
        </CardContent>
        <div className="pb-4 text-center">
          <a
            href="https://apptrix.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-dark-400 hover:text-dark-600 dark:text-dark-500 dark:hover:text-dark-300 transition-colors"
          >
            Powered by Apptrix
          </a>
        </div>
      </Card>
    </div>
  )
}
