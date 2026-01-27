import { cookies, headers } from 'next/headers'
import { normalizeLocale } from './locales'

const LOCALE_COOKIE = 'vaultrix_locale'

export function getInitialLocale() {
  const cookieStore = cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  if (cookieLocale) {
    return normalizeLocale(cookieLocale)
  }

  const headerLocale = headers().get('accept-language') || ''
  return normalizeLocale(headerLocale)
}

export function getLocaleCookieName() {
  return LOCALE_COOKIE
}
