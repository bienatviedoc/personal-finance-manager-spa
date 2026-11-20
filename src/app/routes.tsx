import type { QueryClient } from '@tanstack/react-query'
import type { RouteObject } from 'react-router'
import { accountsRoutes } from '@/features/accounts'
import { authRoutes, requireSignedInUser } from '@/features/auth'
import { budgetsRoutes } from '@/features/budgets'
import { dashboardRoutes } from '@/features/dashboard'
import { importsRoutes } from '@/features/imports'
import { recurringRoutes } from '@/features/recurring'
import { reportsRoutes } from '@/features/reports'
import { settingsRoutes } from '@/features/settings'
import { transactionsRoutes } from '@/features/transactions'
import { AppShell } from './AppShell'
import { AuthLayout } from './AuthLayout'
import { NotFoundPage } from './NotFoundPage'
import { RouteError } from './RouteError'

/** Screens shown inside the app shell, with sidebar navigation. */
const shellScreens: RouteObject[] = [
  ...dashboardRoutes,
  ...transactionsRoutes,
  ...accountsRoutes,
  ...budgetsRoutes,
  ...reportsRoutes,
  ...recurringRoutes,
  ...importsRoutes,
  ...settingsRoutes,
]

/**
 * The app's route tree. `extraScreens` are added inside the shell next to the real screens;
 * tests use it to mount a screen that fails.
 */
export function createRoutes({ queryClient, extraScreens = [] }: { queryClient: QueryClient; extraScreens?: RouteObject[] }): RouteObject[] {
  return [
    {
      path: '/',
      Component: AppShell,
      loader: requireSignedInUser(queryClient),
      // Catches a failure in the shell itself; screens have their own boundaries below.
      ErrorBoundary: RouteError,
      children: [...shellScreens, ...extraScreens, { path: '*', Component: NotFoundPage }].map(withErrorBoundary),
    },
    {
      Component: AuthLayout,
      ErrorBoundary: RouteError,
      children: authRoutes.map(withErrorBoundary),
    },
  ]
}

/**
 * Gives a screen its own error boundary, so its failure stays inside its part of the page. Screens nested
 * in it (the sections of Settings) get their own too.
 */
function withErrorBoundary(route: RouteObject): RouteObject {
  const bounded = route.ErrorBoundary || route.errorElement ? route : { ...route, ErrorBoundary: RouteError }
  return bounded.children ? ({ ...bounded, children: bounded.children.map(withErrorBoundary) } as RouteObject) : bounded
}
