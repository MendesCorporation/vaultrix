import { Suspense } from 'react'
import { LoginForm } from './LoginForm'
import { getConfigValue } from '@/lib/db/queries/system'
import { getInitialLocale } from '@/lib/i18n/server'
import { getDictionary, translate } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const brandingLogoUrl = await getConfigValue<string>('branding_logo_url')
  const locale = getInitialLocale()
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) => translate(dictionary, key, values)

  return (
    <Suspense
      fallback={(
        <div className="w-full max-w-md text-center text-sm text-dark-500">
          {t('common.loading')}
        </div>
      )}
    >
      <LoginForm brandingLogoUrl={brandingLogoUrl} />
    </Suspense>
  )
}
