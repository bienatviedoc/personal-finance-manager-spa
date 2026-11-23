import { useTranslation } from 'react-i18next'
import type { Category } from './api/categories'

/** One category as a picker offers it. */
export type CategoryChoice = { category: Category; label: string }

/**
 * Every category in the tree, each top-level one followed by its subcategories, named as a picker names it: a
 * subcategory after its parent (Food & drink › Groceries). A picker narrows them to what it offers.
 */
export function useCategoryChoices(tree: Category[]): CategoryChoice[] {
  const { t } = useTranslation()
  return tree.flatMap((category) => [
    { category, label: category.name },
    ...category.subcategories.map((subcategory) => ({ category: subcategory, label: t('categories.option', { parent: category.name, name: subcategory.name }) })),
  ])
}

/** The category with this id anywhere in the tree, subcategories included. */
export function findCategory(tree: Category[], id: string | null): Category | undefined {
  return tree.flatMap((category) => [category, ...category.subcategories]).find((category) => category.id === id)
}
