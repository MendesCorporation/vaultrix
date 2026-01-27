'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/components/providers/LocaleProvider'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: string
  message: string
  title?: string
  variant: ToastVariant
  duration?: number
}

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = createId()
      const duration = toast.duration ?? 4000
      setToasts((prev) => [...prev, { ...toast, id }])
      window.setTimeout(() => remove(id), duration)
    },
    [remove]
  )

  const contextValue = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 rounded-xl border border-dark-100 bg-white p-4 shadow-lg dark:border-dark-700 dark:bg-dark-800',
              toast.variant === 'success' && 'border-green-200 dark:border-green-900/40',
              toast.variant === 'error' && 'border-red-200 dark:border-red-900/40',
              toast.variant === 'info' && 'border-blue-200 dark:border-blue-900/40'
            )}
          >
            <div className="mt-0.5">
              {toast.variant === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              {toast.variant === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
              {toast.variant === 'info' && <Info className="h-5 w-5 text-blue-500" />}
            </div>
            <div className="flex-1">
              {toast.title && (
                <p className="text-sm font-semibold text-dark-900 dark:text-white">{toast.title}</p>
              )}
              <p className="text-sm text-dark-600 dark:text-dark-300">{toast.message}</p>
            </div>
            <button
              onClick={() => remove(toast.id)}
              className="text-sm text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
              aria-label={t('common.close')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider')
  }

  return {
    success: (message: string, title?: string) => context.push({ variant: 'success', message, title }),
    error: (message: string, title?: string) => context.push({ variant: 'error', message, title }),
    info: (message: string, title?: string) => context.push({ variant: 'info', message, title }),
  }
}
