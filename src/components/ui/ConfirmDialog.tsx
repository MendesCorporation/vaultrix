'use client'

import * as React from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from './Modal'
import { Button } from './Button'
import { AlertTriangle } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  const { t } = useLocale()
  const resolvedTitle = title || t('common.confirm')
  const resolvedConfirm = confirmText || t('common.confirm')
  const resolvedCancel = cancelText || t('common.cancel')

  return (
    <Modal open={open} onClose={onClose} className="max-w-md">
      <ModalHeader onClose={onClose}>{resolvedTitle}</ModalHeader>
      <ModalBody>
        <div className="flex gap-4">
          {variant === 'danger' && (
            <div className="flex-shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          )}
          <p className="text-dark-600 dark:text-dark-300">{message}</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {resolvedCancel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'destructive' : 'default'}
          onClick={onConfirm}
          isLoading={isLoading}
        >
          {resolvedConfirm}
        </Button>
      </ModalFooter>
    </Modal>
  )
}
