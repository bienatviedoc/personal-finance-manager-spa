import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { AppProviders } from '@/app/AppProviders'
import { createRoutes } from '@/app/routes'
import { createI18n, type Language } from '@/shared/i18n'

type Options = {
  /** Screens mounted inside the shell next to the real ones. */
  extraScreens?: RouteObject[]
  /** English unless told to detect the language the way the real app does. */
  language?: Language | 'detect'
}

/** Renders the real app at a URL with an in-memory history. */
export function renderApp(path = '/', { extraScreens, language = 'en' }: Options = {}) {
  const i18n = createI18n(language === 'detect' ? {} : { language })
  const router = createMemoryRouter(createRoutes(extraScreens), { initialEntries: [path] })
  const user = userEvent.setup()

  const result = render(
    <AppProviders i18n={i18n}>
      <RouterProvider router={router} />
    </AppProviders>,
  )

  return { ...result, user, router, i18n }
}
