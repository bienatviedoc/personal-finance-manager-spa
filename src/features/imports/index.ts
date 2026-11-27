import type { RouteObject } from 'react-router'
import { ImportBatchPage } from './routes/ImportBatchPage'
import { ImportPage } from './routes/ImportPage'

export const importsRoutes: RouteObject[] = [
  { path: 'import', Component: ImportPage },
  { path: 'import/:batchId', Component: ImportBatchPage },
]
