import { redirect, type RouteObject } from 'react-router'
import { CategoriesPage } from '@/features/categories'
import { DataSettingsPage } from './routes/DataSettingsPage'
import { ProfileSettingsPage } from './routes/ProfileSettingsPage'
import { SecuritySettingsPage } from './routes/SecuritySettingsPage'
import { SettingsPage } from './routes/SettingsPage'

export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    Component: SettingsPage,
    children: [
      { index: true, loader: () => redirect('/settings/profile') },
      { path: 'profile', Component: ProfileSettingsPage },
      { path: 'categories', Component: CategoriesPage },
      { path: 'security', Component: SecuritySettingsPage },
      { path: 'data', Component: DataSettingsPage },
    ],
  },
]

export { refreshProfile, useProfileLocale, useSaveLocale, useUserSettings } from './api/profile'
