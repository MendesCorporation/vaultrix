import { NextRequest, NextResponse } from 'next/server'
import { normalizeLocale } from '@/lib/i18n/locales'
import { getLocaleCookieName } from '@/lib/i18n/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const locale = normalizeLocale(body?.locale)
  const response = NextResponse.json({ locale })
  response.cookies.set(getLocaleCookieName(), locale, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}
