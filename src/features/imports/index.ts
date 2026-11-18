import type { RouteObject } from 'react-router'
import { ImportPage } from './routes/ImportPage'

export const importsRoutes: RouteObject[] = [
  { path: 'import', Component: ImportPage },
]
