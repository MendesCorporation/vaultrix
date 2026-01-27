'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui'
import { KeyRound, Smartphone, ArrowLeft } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

interface LoginFormProps {
  brandingLogoUrl?: string | null
}

type LoginStep = 'credentials' | 'mfa' | 'mfa_setup'

export function LoginForm({ brandingLogoUrl }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const { t } = useLocale()

  const defaultLogoSrc = '/brand/logo.svg'
  const [logoSrc, setLogoSrc] = useState(brandingLogoUrl || defaultLogoSrc)
  const hasCustomLogo = logoSrc !== defaultLogoSrc

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<LoginStep>('credentials')
  const [mfaSetupData, setMfaSetupData] = useState<{
    qrCodeDataUrl: string
    secret: string
  } | null>(null)

  useEffect(() => {
    setLogoSrc(brandingLogoUrl || defaultLogoSrc)
  }, [brandingLogoUrl])

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // First, check MFA status using our reliable endpoint
      const checkRes = await fetch('/api/auth/mfa/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!checkRes.ok) {
        if (checkRes.status === 401) {
          setError(t('login.invalidCredentials'))
        } else if (checkRes.status === 429) {
          setError(t('login.tooManyAttempts'))
        } else {
          setError(t('login.genericError'))
        }
        setIsLoading(false)
        return
      }

      const mfaStatus = await checkRes.json()

      // If MFA is needed, handle accordingly
      if (mfaStatus.needsSetup) {
        // User needs to set up MFA first
        await startMfaSetup()
        return
      }

      if (mfaStatus.needsCode) {
        // User has MFA set up, needs to enter code
        setStep('mfa')
        setIsLoading(false)
        return
      }

      // No MFA required, proceed with normal login
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(t('login.invalidCredentials'))
      } else {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch (err) {
      setError(t('login.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  const startMfaSetup = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || t('login.mfa.setupError'))
        return
      }

      const data = await res.json()
      setMfaSetupData({
        qrCodeDataUrl: data.qrCodeDataUrl,
        secret: data.secret,
      })
      setStep('mfa_setup')
    } catch (err) {
      setError(t('login.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        otp,
        redirect: false,
      })

      if (result?.error) {
        // MFA code was invalid or some other error
        setError(t('login.mfa.invalidCode'))
      } else {
        router.push(callbackUrl)
        router.refresh()
      }
    } catch (err) {
      setError(t('login.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToCredentials = () => {
    setStep('credentials')
    setOtp('')
    setMfaSetupData(null)
    setError('')
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            hasCustomLogo ? 'bg-transparent' : 'bg-primary-100 dark:bg-primary-900/30'
          }`}
        >
          <img
            src={logoSrc}
            alt="Logo"
            className="h-10 w-10 object-contain"
            onError={() => {
              if (logoSrc !== defaultLogoSrc) setLogoSrc(defaultLogoSrc)
            }}
          />
        </div>
        <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
        <CardDescription>
          {step === 'credentials' && t('login.subtitle')}
          {step === 'mfa' && t('login.mfa.subtitle')}
          {step === 'mfa_setup' && t('login.mfa.setupSubtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <Input
              label={t('login.email')}
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <Input
              label={t('login.password')}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {t('login.signIn')}
            </Button>

            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
              >
                {t('login.forgotPassword')}
              </Link>
            </div>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                <Smartphone className="h-8 w-8 text-primary-500" />
              </div>
            </div>

            <p className="text-center text-sm text-dark-500">
              {t('login.mfa.enterCode')}
            </p>

            <Input
              label={t('login.mfa.code')}
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              autoComplete="one-time-code"
            />

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              disabled={otp.length !== 6}
            >
              {t('login.mfa.verify')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBackToCredentials}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('common.back')}
            </Button>
          </form>
        )}

        {step === 'mfa_setup' && mfaSetupData && (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <p className="text-center text-sm text-dark-500">
              {t('login.mfa.setupStep1')}
            </p>

            <div className="flex justify-center">
              <img
                src={mfaSetupData.qrCodeDataUrl}
                alt="QR Code"
                className="h-48 w-48 rounded-lg bg-white p-2"
              />
            </div>

            <div className="space-y-2">
              <p className="text-center text-sm text-dark-500">{t('login.mfa.manualEntry')}</p>
              <code className="block rounded bg-dark-100 p-2 text-center text-sm dark:bg-dark-700">
                {mfaSetupData.secret}
              </code>
            </div>

            <p className="text-center text-sm text-dark-500">
              {t('login.mfa.setupStep2')}
            </p>

            <Input
              label={t('login.mfa.code')}
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              maxLength={6}
              autoComplete="one-time-code"
            />

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              disabled={otp.length !== 6}
            >
              {t('login.mfa.verifyAndEnable')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBackToCredentials}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('common.back')}
            </Button>
          </form>
        )}
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
  )
}
