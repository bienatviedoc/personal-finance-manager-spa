import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '@/app/AppProviders'
import { createQueryClient } from '@/app/queryClient'
import { createRoutes } from '@/app/routes'
import { createI18n } from '@/shared/i18n'
import './index.css'

const i18n = createI18n()
const queryClient = createQueryClient()
const router = createBrowserRouter(createRoutes({ queryClient }))

const root = document.getElementById('root')
if (!root) throw new Error('The #root element is missing from index.html.')

createRoot(root).render(
  <StrictMode>
    <AppProviders i18n={i18n} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
