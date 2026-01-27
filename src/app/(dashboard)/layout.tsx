import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/Header'
import { getConfigValue } from '@/lib/db/queries/system'
import { getInitialLocale } from '@/lib/i18n/server'
import { getDictionary, translate } from '@/lib/i18n'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const locale = getInitialLocale()
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(dictionary, key, values)

  if (!session) {
    redirect('/login')
  }

  const setupCompleted = await getConfigValue<boolean>('setup_completed')
  if (!setupCompleted && session.user.role === 'SUPER_ADMIN') {
    redirect('/setup')
  }

  const brandingLogoUrl = await getConfigValue<string>('branding_logo_url')
  const showObservability = true

  const user = {
    name: session.user.name ?? session.user.email ?? t('common.username'),
    email: session.user.email ?? 'unknown@local',
    role: session.user.role,
  }

  return (
    <div className="flex h-screen bg-dark-50 dark:bg-dark-900">
      <Sidebar user={user} brandingLogoUrl={brandingLogoUrl} showObservability={showObservability} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
