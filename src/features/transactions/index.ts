import type { RouteObject } from 'react-router'
import { AccountDetailPage } from './routes/AccountDetailPage'
import { RecentlyDeletedPage } from './routes/RecentlyDeletedPage'
import { TransactionsPage } from './routes/TransactionsPage'

export const transactionsRoutes: RouteObject[] = [
  { path: 'transactions', Component: TransactionsPage },
  { path: 'transactions/deleted', Component: RecentlyDeletedPage },
  // An account's page is its transactions and its balance over time, so it lives with the transactions.
  { path: 'accounts/:accountId', Component: AccountDetailPage },
]

export { QuickAdd } from './components/QuickAdd'
export { refreshTransactions, takesFromBalance } from './api/transactions'
export { titleOf } from './components/transactionTitle'
