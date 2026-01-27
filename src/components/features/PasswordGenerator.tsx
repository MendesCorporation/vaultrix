'use client'

import { useState } from 'react'
import { Button, Input } from '@/components/ui'
import { RefreshCw, Copy, Check } from 'lucide-react'
import { useLocale } from '@/components/providers/LocaleProvider'

interface PasswordGeneratorProps {
  onGenerate: (password: string) => void
}

export function PasswordGenerator({ onGenerate }: PasswordGeneratorProps) {
  const { t } = useLocale()
  const [password, setPassword] = useState('')
  const [length, setLength] = useState(24)
  const [options, setOptions] = useState({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  })
  const [copied, setCopied] = useState(false)

  const generatePassword = () => {
    let charset = ''
    if (options.uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (options.lowercase) charset += 'abcdefghijklmnopqrstuvwxyz'
    if (options.numbers) charset += '0123456789'
    if (options.symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?'

    if (charset.length === 0) {
      charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    }

    const array = new Uint8Array(length)
    crypto.getRandomValues(array)

    let newPassword = ''
    for (let i = 0; i < length; i++) {
      newPassword += charset[array[i] % charset.length]
    }

    setPassword(newPassword)
    onGenerate(newPassword)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 rounded-lg border border-dark-200 p-4 dark:border-dark-700">
      <div className="flex items-center gap-2">
        <Input
          value={password}
          readOnly
          placeholder={t('passwordGenerator.placeholder')}
          className="font-mono"
        />
        <Button variant="ghost" size="icon" onClick={handleCopy} disabled={!password}>
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button variant="secondary" size="icon" onClick={generatePassword}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <label className="text-sm">
          {t('passwordGenerator.length', { length })}
        </label>
        <input
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="flex-1"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        {Object.entries(options).map(([key, value]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
              className="rounded border-dark-300 text-primary-500 focus:ring-primary-500"
            />
            {key === 'uppercase' && t('passwordGenerator.uppercase')}
            {key === 'lowercase' && t('passwordGenerator.lowercase')}
            {key === 'numbers' && t('passwordGenerator.numbers')}
            {key === 'symbols' && t('passwordGenerator.symbols')}
          </label>
        ))}
      </div>
    </div>
  )
}
