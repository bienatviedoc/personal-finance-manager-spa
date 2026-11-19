import type { RouteObject } from 'react-router'
import { CategoriesPage } from './routes/CategoriesPage'

export const categoriesRoutes: RouteObject[] = [{ path: 'settings/categories', Component: CategoriesPage }]

export { useCategories, type Category, type CategoryKind } from './api/categories'
export { CategoryBadge } from './components/CategoryBadge'
