import { prisma } from '@/lib/db/prisma'
import { InviteForm } from './InviteForm'
import { getInitialLocale } from '@/lib/i18n/server'
import { getDictionary, translate } from '@/lib/i18n'

interface InvitePageProps {
  params: { token: string }
}

export default async function InvitePage({ params }: InvitePageProps) {
  const locale = getInitialLocale()
  const dictionary = getDictionary(locale)
  const t = (key: string, values?: Record<string, string | number>) =>
    translate(dictionary, key, values)

  const invite = await prisma.invite.findUnique({
    where: { token: params.token },
    select: {
      name: true,
      email: true,
      expiresAt: true,
      usedAt: true,
    },
  })

  const now = new Date()

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 py-10 dark:bg-dark-900">
        <div className="w-full max-w-lg rounded-xl border border-dark-200 bg-white p-6 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <h1 className="text-xl font-semibold">{t('invite.invalidTitle')}</h1>
          <p className="mt-2 text-sm text-dark-500">
            {t('invite.invalidDescription')}
          </p>
        </div>
      </div>
    )
  }

  if (invite.usedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 py-10 dark:bg-dark-900">
        <div className="w-full max-w-lg rounded-xl border border-dark-200 bg-white p-6 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <h1 className="text-xl font-semibold">{t('invite.usedTitle')}</h1>
          <p className="mt-2 text-sm text-dark-500">
            {t('invite.usedDescription')}
          </p>
        </div>
      </div>
    )
  }

  if (invite.expiresAt < now) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 py-10 dark:bg-dark-900">
        <div className="w-full max-w-lg rounded-xl border border-dark-200 bg-white p-6 text-center shadow-sm dark:border-dark-700 dark:bg-dark-800">
          <h1 className="text-xl font-semibold">{t('invite.expiredTitle')}</h1>
          <p className="mt-2 text-sm text-dark-500">
            {t('invite.expiredDescription')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-50 px-4 py-10 dark:bg-dark-900">
      <InviteForm token={params.token} name={invite.name} email={invite.email} />
    </div>
  )
}
