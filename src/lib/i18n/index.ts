import { en } from './dictionaries/en'
import { pt } from './dictionaries/pt'
import type { SupportedLocale } from './locales'

const dictionaries = { en, pt } as const

export type Dictionary = typeof en

export function getDictionary(locale: SupportedLocale) {
  return dictionaries[locale] || dictionaries.pt
}

export function translate(
  dictionary: Dictionary,
  key: string,
  values?: Record<string, string | number>
) {
  const parts = key.split('.')
  let current: any = dictionary
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      return key
    }
  }
  if (typeof current !== 'string') return key
  if (!values) return current

  return current.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const value = values[token]
    return value === undefined ? match : String(value)
  })
}
