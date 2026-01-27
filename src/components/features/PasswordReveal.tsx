'use client'

import { useState } from 'react'
import { Button } from '@/components/ui'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'
import { useToast } from '@/components/providers/ToastProvider'
import { useLocale } from '@/components/providers/LocaleProvider'

interface PasswordRevealProps {
  onReveal: () => Promise<string>
  onRevealAudit?: () => Promise<void> | void
  onCopyAudit?: () => Promise<void> | void
  className?: string
}

export function PasswordReveal({ onReveal, onRevealAudit, onCopyAudit, className }: PasswordRevealProps) {
  const toast = useToast()
  const { t } = useLocale()
  const [isRevealed, setIsRevealed] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [copied, setCopied] = useState(false)

  const scheduleClear = () => {
    setTimeout(() => {
      setIsRevealed(false)
      setPassword(null)
    }, 30000)
  }

  const handleReveal = async () => {
    if (isRevealed) {
      setIsRevealed(false)
      setPassword(null)
      return
    }

    setIsLoading(true)
    try {
      const pwd = password || await onReveal()
      setPassword(pwd)
      setIsRevealed(true)

      if (onRevealAudit) {
        try {
          await onRevealAudit()
        } catch (auditError) {
          console.error('Failed to audit reveal:', auditError)
        }
      }

      scheduleClear()
    } catch (error) {
      console.error('Failed to reveal password:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (isCopying || isLoading) return
    setIsCopying(true)

    try {
      const pwd = password || await onReveal()
      if (!pwd) {
        toast.error(t('passwordReveal.copyError'))
        return
      }

      if (!password) {
        setPassword(pwd)
        scheduleClear()
      }

      await navigator.clipboard.writeText(pwd)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success(t('passwordReveal.copySuccess'))

      if (onCopyAudit) {
        try {
          await onCopyAudit()
        } catch (auditError) {
          console.error('Failed to audit copy:', auditError)
        }
      }

      // Clear clipboard after 30 seconds
      setTimeout(() => {
        navigator.clipboard.writeText('')
      }, 30000)
    } catch (error) {
      console.error('Failed to copy password:', error)
      toast.error(t('passwordReveal.copyError'))
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 min-w-0 rounded-lg bg-dark-100 px-3 py-2 font-mono text-sm dark:bg-dark-700">
        <span className={isRevealed && password ? 'block truncate' : ''} title={isRevealed && password ? password : undefined}>
          {isRevealed && password ? password : '••••••••••••'}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleReveal}
        isLoading={isLoading}
        title={isRevealed ? t('passwordReveal.hide') : t('passwordReveal.reveal')}
        className="flex-shrink-0"
      >
        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title={t('passwordReveal.copy')}
        isLoading={isCopying}
        className="flex-shrink-0"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
