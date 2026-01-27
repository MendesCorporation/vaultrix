'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getDictionary, translate } from '@/lib/i18n'
import { normalizeLocale, supportedLocales, type SupportedLocale } from '@/lib/i18n/locales'

interface LocaleContextValue {
  locale: SupportedLocale
  setLocale: (nextLocale: SupportedLocale) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

interface LocaleProviderProps {
  children: React.ReactNode
  initialLocale?: string
  userLocale?: string | null
}

const LOCALE_STORAGE_KEY = 'vaultrix_locale'

export function LocaleProvider({ children, initialLocale, userLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => normalizeLocale(initialLocale))

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    const normalized = normalizeLocale(nextLocale)
    setLocaleState(normalized)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized)
      document.cookie = `vaultrix_locale=${normalized}; path=/; max-age=31536000`
    }
    fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: normalized }),
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem(LOCALE_STORAGE_KEY)
      : null
    if (stored) {
      const normalized = normalizeLocale(stored)
      if (normalized !== locale) {
        setLocaleState(normalized)
      }
      return
    }

    if (userLocale) {
      const normalized = normalizeLocale(userLocale)
      if (normalized !== locale) {
        setLocale(normalized)
      }
    }
  }, [userLocale])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  const dictionary = useMemo(() => getDictionary(locale), [locale])

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      translate(dictionary, key, values),
    [dictionary]
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider')
  }
  return ctx
}

export const localeOptions = supportedLocales.map((locale) => ({
  value: locale,
  label: locale === 'pt' ? 'Português' : 'English',
}))
