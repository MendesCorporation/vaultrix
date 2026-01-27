'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* Content */}
      <div
        className={cn(
          'relative z-10 max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl dark:bg-dark-800',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface ModalHeaderProps {
  children: React.ReactNode
  onClose?: () => void
}

export function ModalHeader({ children, onClose }: ModalHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">{children}</h2>
      {onClose && (
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-dark-400 hover:bg-dark-100 hover:text-dark-600 dark:hover:bg-dark-700"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-3">
      {children}
    </div>
  )
}
