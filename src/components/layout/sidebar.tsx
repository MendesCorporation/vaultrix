'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useLocale } from '@/components/providers/LocaleProvider'
import {
  LayoutDashboard,
  Server,
  Key,
  Cloud,
  Layers,
  Users,
  UserCog,
  ScrollText,
  Activity,
  Settings,
  Moon,
  Sun,
} from 'lucide-react'
import type { UserRole } from '@prisma/client'

interface SidebarProps {
  user: {
    name: string
    email: string
    role: UserRole
  }
  brandingLogoUrl?: string | null
  showObservability?: boolean
}

export function Sidebar({ user, brandingLogoUrl, showObservability = false }: SidebarProps) {
  const pathname = usePathname()
  const { setTheme, resolvedTheme } = useTheme()
  const { t } = useLocale()

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  const canViewObservability = showObservability || isAdmin
  const defaultLogoSrc = '/brand/logo.svg'
  const [logoSrc, setLogoSrc] = useState(brandingLogoUrl || defaultLogoSrc)
  const hasCustomLogo = logoSrc !== defaultLogoSrc

  const navigation = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.machines'), href: '/machines', icon: Server },
    { name: t('nav.credentials'), href: '/credentials', icon: Key },
    { name: t('nav.platforms'), href: '/platforms', icon: Cloud },
    { name: t('nav.stacks'), href: '/stacks', icon: Layers },
  ]

  const adminNavigation = [
    { name: t('nav.users'), href: '/users', icon: Users },
    { name: t('nav.groups'), href: '/groups', icon: UserCog },
    { name: t('nav.audit'), href: '/audit', icon: ScrollText },
  ]

  useEffect(() => {
    setLogoSrc(brandingLogoUrl || defaultLogoSrc)
  }, [brandingLogoUrl])

  return (
    <aside className="flex w-60 flex-col border-r border-dark-200 bg-white dark:border-dark-700 dark:bg-dark-800">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-dark-200 px-6 dark:border-dark-700">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            hasCustomLogo ? 'bg-transparent' : 'bg-primary-500'
          )}
        >
          <img
            src={logoSrc}
            alt="Logo"
            className="h-6 w-6 object-contain"
            onError={() => {
              if (logoSrc !== defaultLogoSrc) setLogoSrc(defaultLogoSrc)
            }}
          />
        </div>
        <div>
          <h1 className="text-lg font-bold text-dark-900 dark:text-white">VAULTRIX</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-500 text-white'
                  : 'text-dark-600 hover:bg-dark-100 dark:text-dark-300 dark:hover:bg-dark-700'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}

        {canViewObservability && (
          <Link
            href="/observability"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              pathname === '/observability' || pathname.startsWith('/observability/')
                ? 'bg-primary-500 text-white'
                : 'text-dark-600 hover:bg-dark-100 dark:text-dark-300 dark:hover:bg-dark-700'
            )}
          >
            <Activity className="h-5 w-5" />
            {t('nav.observability')}
          </Link>
        )}

        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            pathname === '/settings' || pathname.startsWith('/settings/')
              ? 'bg-primary-500 text-white'
              : 'text-dark-600 hover:bg-dark-100 dark:text-dark-300 dark:hover:bg-dark-700'
          )}
        >
          <Settings className="h-5 w-5" />
          {t('nav.settings')}
        </Link>

        {isAdmin && (
          <>
            <div className="my-4 border-t border-dark-200 dark:border-dark-700" />
            <p className="mt-4 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-dark-400">
              {t('nav.adminSection')}
            </p>
            {adminNavigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-500 text-white'
                      : 'text-dark-600 hover:bg-dark-100 dark:text-dark-300 dark:hover:bg-dark-700'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User & Theme */}
      <div className="border-t border-dark-200 p-4 dark:border-dark-700">
        {/* User info */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-dark-500">
              {user.role === 'SUPER_ADMIN'
                ? t('users.roles.superAdmin')
                : user.role === 'ADMIN'
                  ? t('users.roles.adminLabel')
                  : t('users.roles.userLabel')}
            </p>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center justify-between rounded-lg bg-dark-100 p-1 dark:bg-dark-700">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors',
              resolvedTheme === 'light'
                ? 'bg-white text-dark-900 shadow-sm dark:bg-dark-600 dark:text-white'
                : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
            )}
          >
            <Sun className="h-4 w-4" />
            {t('common.light')}
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors',
              resolvedTheme === 'dark'
                ? 'bg-white text-dark-900 shadow-sm dark:bg-dark-600 dark:text-white'
                : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
            )}
          >
            <Moon className="h-4 w-4" />
            {t('common.dark')}
          </button>
        </div>
      </div>
    </aside>
  )
}
