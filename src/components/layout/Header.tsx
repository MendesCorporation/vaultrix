'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui'
import { LogOut } from 'lucide-react'
import type { UserRole } from '@prisma/client'
import { useLocale } from '@/components/providers/LocaleProvider'
import { NotificationsDropdown } from './NotificationsDropdown'

interface HeaderProps {
  user: {
    name: string
    email: string
    role: UserRole
  }
}

export function Header({ user }: HeaderProps) {
  const { t } = useLocale()
  return (
    <header className="flex h-16 items-center justify-between border-b border-dark-200 bg-white px-6 dark:border-dark-700 dark:bg-dark-800">
      <div />
      {/* Actions */}
      <div className="flex items-center gap-2">
        <NotificationsDropdown />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-dark-600 dark:text-dark-300"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('header.signOut')}
        </Button>
      </div>
    </header>
  )
}
