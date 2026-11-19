import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { i18n } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

type Props = { i18n: i18n; queryClient: QueryClient; children: ReactNode }

/** The query client is shared with the router, whose loaders read from the same cache. */
export function AppProviders({ i18n, queryClient, children }: Props) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  )
}
