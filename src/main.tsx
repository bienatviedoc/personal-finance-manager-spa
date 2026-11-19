import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '@/app/AppProviders'
import { createQueryClient } from '@/app/queryClient'
import { createRoutes } from '@/app/routes'
import { createI18n } from '@/shared/i18n'
import { startErrorReporting } from '@/shared/observability/errorReporting'
import './index.css'

// Started first, so even an error while the app starts is reported.
if (import.meta.env.VITE_SENTRY_DSN) {
  startErrorReporting({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.MODE })
}

const i18n = createI18n()
const queryClient = createQueryClient()
const router = createBrowserRouter(createRoutes({ queryClient }))

const root = document.getElementById('root')
if (!root) throw new Error('The #root element is missing from index.html.')

// Screens report their own failures (see RouteError). Anything outside them React raises as a
// window error, which is logged to the console and which the error tracker listens for.
createRoot(root).render(
  <StrictMode>
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
