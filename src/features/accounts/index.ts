import type { RouteObject } from 'react-router'
import { AccountsPage } from './routes/AccountsPage'
import { AccountDetailPage } from './routes/AccountDetailPage'
import { InstitutionsPage } from './routes/InstitutionsPage'

export const accountsRoutes: RouteObject[] = [
  { path: 'accounts', Component: AccountsPage },
  { path: 'accounts/institutions', Component: InstitutionsPage },
  { path: 'accounts/:accountId', Component: AccountDetailPage },
]

export { accountsQuery, refreshAccountBalances, type Account } from './api/accounts'
export { currencyOf, findAccount, useAccountChoices } from './accountChoices'
