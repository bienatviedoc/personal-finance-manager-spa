import type { RouteObject } from 'react-router'
import { RecurringPage } from './routes/RecurringPage'

export const recurringRoutes: RouteObject[] = [
  { path: 'recurring', Component: RecurringPage },
]
