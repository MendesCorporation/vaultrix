'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

export default function ForgotPasswordPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.status === 429) {
        setError(t('forgotPassword.tooManyAttempts'))
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('forgotPassword.genericError'))
        return
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(t('forgotPassword.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 dark:bg-dark-900">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">{t('forgotPassword.sentTitle')}</CardTitle>
            <CardDescription>{t('forgotPassword.sentDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-6 text-center text-sm text-dark-500">
              {t('forgotPassword.checkInbox')}
            </p>
            <Link href="/login">
              <Button variant="secondary" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('forgotPassword.backToLogin')}
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
            <Mail className="h-8 w-8 text-primary-500" />
          </div>
          <CardTitle className="text-2xl">{t('forgotPassword.title')}</CardTitle>
          <CardDescription>{t('forgotPassword.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t('forgotPassword.email')}
              type="email"
              placeholder={t('forgotPassword.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              <Mail className="mr-2 h-4 w-4" />
              {t('forgotPassword.submit')}
            </Button>

            <Link href="/login">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('forgotPassword.backToLogin')}
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
