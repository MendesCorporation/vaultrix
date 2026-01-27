'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { ToastProvider } from '@/components/providers/ToastProvider'
import { ConfirmProvider } from '@/components/providers/ConfirmProvider'
import { LocaleProvider } from '@/components/providers/LocaleProvider'
import { useState } from 'react'

function LocaleGate({ children, initialLocale }: { children: React.ReactNode; initialLocale?: string }) {
  const { data: session } = useSession()
  return (
    <LocaleProvider initialLocale={initialLocale} userLocale={session?.user?.locale ?? null}>
      {children}
    </LocaleProvider>
  )
}

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale?: string }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleGate initialLocale={initialLocale}>
            <ToastProvider>
              <ConfirmProvider>
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </LocaleGate>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
