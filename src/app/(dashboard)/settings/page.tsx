import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const session = await auth()

  if (!session) {
    redirect('/login')
  }

  return <SettingsClient user={session.user} />
}
