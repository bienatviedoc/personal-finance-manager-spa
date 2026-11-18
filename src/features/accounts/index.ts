import type { RouteObject } from 'react-router'
import { AccountsPage } from './routes/AccountsPage'
import { AccountDetailPage } from './routes/AccountDetailPage'

export const accountsRoutes: RouteObject[] = [
  { path: 'accounts', Component: AccountsPage },
  { path: 'accounts/:accountId', Component: AccountDetailPage },
]
