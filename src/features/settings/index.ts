import type { RouteObject } from 'react-router'
import { SettingsPage } from './routes/SettingsPage'

export const settingsRoutes: RouteObject[] = [
  { path: 'settings/*', Component: SettingsPage },
]
