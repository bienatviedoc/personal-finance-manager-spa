import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { AppProviders } from '@/app/AppProviders'
import { createRoutes } from '@/app/routes'
import { createI18n } from '@/shared/i18n'

/** Renders the real app at a URL, in English, with an in-memory history. */
export function renderApp(path = '/', options: { extraScreens?: RouteObject[] } = {}) {
  const i18n = createI18n({ language: 'en' })
  const router = createMemoryRouter(createRoutes(options.extraScreens), { initialEntries: [path] })
  const user = userEvent.setup()

  const result = render(
    <AppProviders i18n={i18n}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { ...result, user, router, i18n }
}
