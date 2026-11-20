import { redirect, type RouteObject } from 'react-router'
import { CategoriesPage } from '@/features/categories'
import { ProfileSettingsPage } from './routes/ProfileSettingsPage'
import { SettingsPage } from './routes/SettingsPage'

export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    Component: SettingsPage,
    children: [
      { index: true, loader: () => redirect('/settings/profile') },
      { path: 'profile', Component: ProfileSettingsPage },
      { path: 'categories', Component: CategoriesPage },
    ],
  },
]

export { useProfileLocale, useSaveLocale, useUserSettings } from './api/profile'
