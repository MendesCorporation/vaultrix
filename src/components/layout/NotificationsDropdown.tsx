'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, AlertTriangle, Server, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { useLocale } from '@/components/providers/LocaleProvider'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  message: string | null
  machineName: string
  machineIp: string | null
  machineId: string
  alertName: string | null
  triggeredAt: string | null
  key: string | null
  lastValue: string | null
}

export function NotificationsDropdown() {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.data || [])
        setCount(data.count || 0)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getAlertTypeLabel = (notification: Notification) => {
    // Se tem key, é um alerta de métrica
    if (notification.key) {
      switch (notification.key) {
        case 'cpu':
          return t('notifications.types.cpu')
        case 'memory':
          return t('notifications.types.memory')
        case 'disk':
          return t('notifications.types.disk')
        case 'container':
          return t('notifications.types.container')
        default:
          return notification.key
      }
    }
    
    // Se não tem key, é um alerta de máquina offline
    if (notification.type === 'MACHINE_OFFLINE') {
      return t('notifications.types.offline')
    }
    
    return notification.type
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return t('notifications.justNow')
    if (diffMins < 60) return t('notifications.minutesAgo', { count: diffMins })
    if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours })
    return t('notifications.daysAgo', { count: diffDays })
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'MACHINE_OFFLINE':
        return <Server className="h-4 w-4 text-red-500" />
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    }
  }

  const handleOpen = () => {
    setIsOpen(!isOpen)
    if (!isOpen && count > 0) {
      // Marca como visualizado após 1 segundo
      setTimeout(() => {
        setCount(0)
      }, 1000)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleOpen}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-dark-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800">
          <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3 dark:border-dark-700">
            <h3 className="font-semibold">{t('notifications.title')}</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-dark-500">
                {t('common.loading')}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-dark-500">
                {t('notifications.empty')}
              </div>
            ) : (
              <div className="divide-y divide-dark-100 dark:divide-dark-700">
                {notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    href={`/observability/${notification.machineId}`}
                    onClick={() => setIsOpen(false)}
                    className="flex gap-3 p-3 hover:bg-dark-50 dark:hover:bg-dark-700/50"
                  >
                    <div className="mt-0.5">{getIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-dark-900 dark:text-dark-100 truncate">
                        {notification.alertName || getAlertTypeLabel(notification)}
                      </p>
                      <p className="text-xs text-dark-500 truncate">
                        {notification.machineName}
                        {notification.machineIp && ` (${notification.machineIp})`}
                      </p>
                      {notification.key && notification.lastValue && (
                        <p className="text-xs text-dark-400 mt-1">
                          {getAlertTypeLabel(notification)}: {notification.lastValue}
                        </p>
                      )}
                      <p className="text-xs text-dark-400 mt-1">
                        {formatTime(notification.triggeredAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {count > 0 && (
            <div className="border-t border-dark-200 p-2 dark:border-dark-700">
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className="block w-full rounded px-3 py-2 text-center text-sm text-primary-500 hover:bg-dark-50 dark:hover:bg-dark-700/50"
              >
                {t('notifications.manageAlerts')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
