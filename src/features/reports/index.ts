import type { RouteObject } from 'react-router'
import { ReportsPage } from './routes/ReportsPage'

export const reportsRoutes: RouteObject[] = [
  { path: 'reports/:report?', Component: ReportsPage },
]
