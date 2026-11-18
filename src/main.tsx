import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AppProviders } from '@/app/AppProviders'
import { createRoutes } from '@/app/routes'
import { createI18n } from '@/shared/i18n'
import './index.css'

const i18n = createI18n()
const router = createBrowserRouter(createRoutes())

const root = document.getElementById('root')
if (!root) throw new Error('The #root element is missing from index.html.')

createRoot(root).render(
  <StrictMode>
    <AppProviders i18n={i18n}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
