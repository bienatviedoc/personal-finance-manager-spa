import type { RouteObject } from 'react-router'
import { DashboardPage } from './routes/DashboardPage'

export const dashboardRoutes: RouteObject[] = [
  { index: true, Component: DashboardPage },
]

export { refreshDashboard } from './api/dashboard'
