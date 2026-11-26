import type { RouteObject } from 'react-router'
import { RecentlyDeletedPage } from './routes/RecentlyDeletedPage'
import { TransactionsPage } from './routes/TransactionsPage'

export const transactionsRoutes: RouteObject[] = [
  { path: 'transactions', Component: TransactionsPage },
  { path: 'transactions/deleted', Component: RecentlyDeletedPage },
]

export { QuickAdd } from './components/QuickAdd'
export { refreshTransactions, takesFromBalance } from './api/transactions'
