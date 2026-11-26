import type { RouteObject } from 'react-router'
import { BudgetsPage } from './routes/BudgetsPage'

export const budgetsRoutes: RouteObject[] = [
  { path: 'budgets/:month?', Component: BudgetsPage },
]

export { refreshBudgets } from './api/budgets'
export { budgetStates } from './components/budgetStates'
