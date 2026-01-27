'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useLocale } from '@/components/providers/LocaleProvider'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  resolve?: (value: boolean) => void
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLocale()
  const [state, setState] = useState<ConfirmState>({
    open: false,
    options: { title: '' },
  })

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options, resolve })
    })
  }, [])

  const close = useCallback(
    (value: boolean) => {
      state.resolve?.(value)
      setState({ open: false, options: { title: '' } })
    },
    [state]
  )

  const contextValue = useMemo(() => ({ confirm }), [confirm])
  const confirmVariant = state.options.variant === 'danger' ? 'destructive' : 'default'

  return (
    <ConfirmContext.Provider value={contextValue}>
      {children}
      <Modal open={state.open} onClose={() => close(false)} className="max-w-md">
        <ModalHeader onClose={() => close(false)}>
          {state.options.title || t('common.confirm')}
        </ModalHeader>
        <ModalBody>
          {state.options.description && (
            <p className="text-sm text-dark-600 dark:text-dark-300">
              {state.options.description}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={() => close(false)}>
            {state.options.cancelText || t('common.cancel')}
          </Button>
          <Button variant={confirmVariant} type="button" onClick={() => close(true)}>
            {state.options.confirmText || t('common.confirm')}
          </Button>
        </ModalFooter>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm deve ser usado dentro de ConfirmProvider')
  }

  return context
}
