import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { getConfigValue } from '@/lib/db/queries/system'
import { getInitialLocale } from '@/lib/i18n/server'
import { getDictionary, translate } from '@/lib/i18n'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const brandingFaviconUrl = await getConfigValue<string>('branding_favicon_url')
  const faviconUrl = brandingFaviconUrl || '/brand/favicon.svg'
  const locale = getInitialLocale()
  const dictionary = getDictionary(locale)

  return {
    title: translate(dictionary, 'meta.title'),
    description: translate(dictionary, 'meta.description'),
    icons: { icon: faviconUrl },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialLocale = getInitialLocale()
  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body className={inter.className}>
        <Providers initialLocale={initialLocale}>{children}</Providers>
      </body>
    </html>
  )
}
