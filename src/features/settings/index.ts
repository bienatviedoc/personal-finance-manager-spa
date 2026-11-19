import { redirect, type RouteObject } from 'react-router'
import { ProfileSettingsPage } from './routes/ProfileSettingsPage'
import { SettingsPage } from './routes/SettingsPage'

export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    Component: SettingsPage,
    children: [
      { index: true, loader: () => redirect('/settings/profile') },
      { path: 'profile', Component: ProfileSettingsPage },
    ],
  },
]

export { useProfileLanguage, useSaveLanguage, useUpdateProfile, useUserSettings } from './api/profile'
