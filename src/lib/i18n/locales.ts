export const supportedLocales = ['pt', 'en'] as const
export type SupportedLocale = typeof supportedLocales[number]

export function normalizeLocale(input?: string | null): SupportedLocale {
  const value = (input || '').toLowerCase()
  if (value.startsWith('en')) return 'en'
  return 'pt'
}

export const localeToTag: Record<SupportedLocale, string> = {
  pt: 'pt-BR',
  en: 'en-US',
}

export function localeTag(locale?: string | null) {
  const normalized = normalizeLocale(locale)
  return localeToTag[normalized]
}
