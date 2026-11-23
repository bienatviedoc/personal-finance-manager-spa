import type { RouteObject } from 'react-router'
import { TransactionsPage } from './routes/TransactionsPage'

export const transactionsRoutes: RouteObject[] = [
  { path: 'transactions', Component: TransactionsPage },
]

export { QuickAdd } from './components/QuickAdd'
