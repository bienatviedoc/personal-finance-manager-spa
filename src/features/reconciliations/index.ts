import type { RouteObject } from 'react-router'
import { ReconcilePage } from './routes/ReconcilePage'

export const reconciliationsRoutes: RouteObject[] = [{ path: 'accounts/:accountId/reconcile', Component: ReconcilePage }]
