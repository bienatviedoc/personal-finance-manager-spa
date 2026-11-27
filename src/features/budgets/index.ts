import type { RouteObject } from 'react-router'
import { BudgetsPage } from './routes/BudgetsPage'

export const budgetsRoutes: RouteObject[] = [
  { path: 'budgets/:month?', Component: BudgetsPage },
]

export { refreshBudgets, type BudgetState } from './api/budgets'
export { budgetStates } from './components/budgetStates'
export { PaceLabel } from './components/PaceLabel'
export { BudgetNotifications } from './components/BudgetNotifications'
