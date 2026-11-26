import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { Button } from '@/shared/ui/button'
import { categoryMergePreviewQuery, type Category, type MergeOutcome } from '../api/categories'
import { useCategoryChoices } from '../categoryChoices'

type Props = {
  /** The category being merged. */
  category: Category
  /** The tree of categories that are not archived, which the target is chosen from. */
  tree: Category[]
  onMerge: (targetId: string) => Promise<MergeOutcome>
  onCancel: () => void
}

/**
 * Merges a category into another (spec CAT-3): the user picks the category to merge into, sees how many
 * transactions and budgets will move, and confirms. Only a category of the same kind is offered, never the
 * category itself or one of its own subcategories, and one with subcategories only into a top-level one, so the
 * tree stays two levels deep. The API checks it all again, and the budget rule too.
 */
export function MergeCategoryForm({ category, tree, onMerge, onCancel }: Props) {
  const { t } = useTranslation()
  const [targetId, setTargetId] = useState('')
  const [refused, setRefused] = useState(false)
  const pickerId = useId()
  const titleId = useId()
  const hasSubcategories = category.subcategories.length > 0
  const offered = useCategoryChoices(tree).filter(
    ({ category: choice }) =>
      choice.kind === category.kind &&
      choice.id !== category.id &&
      choice.parentId !== category.id &&
      (!hasSubcategories || choice.parentId === null),
  )
  const target = offered.find((choice) => choice.category.id === targetId)?.category
  const preview = useQuery({ ...categoryMergePreviewQuery(category.id), enabled: target !== undefined })

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!target) return
    // Whoever merges says that it failed; the form stays open to try again.
    const outcome = await onMerge(target.id).catch(() => undefined)
    if (outcome && !outcome.merged) setRefused(true)
  }

  return (
    <form aria-labelledby={titleId} onSubmit={(event) => void onSubmit(event)} className="mt-2 space-y-3 rounded-md bg-muted p-3">
      <h4 id={titleId} className="font-medium">
        {t('categories.merge.title', { name: category.name })}
      </h4>
      <div className="flex flex-col gap-1">
        <label htmlFor={pickerId} className="text-sm">
          {t('categories.merge.into')}
        </label>
        <select
          id={pickerId}
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value)
            setRefused(false)
          }}
          className="rounded-md border border-input bg-background px-2 py-1"
        >
          <option value="">{t('categories.merge.choose')}</option>
          {offered.map(({ category: choice, label }) => (
            <option key={choice.id} value={choice.id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {target && preview.data && (
        <p className="text-sm">
          {t('categories.merge.moves', {
            transactions: t('categories.merge.transactions', { count: preview.data.transactions }),
            budgets: t('categories.merge.budgets', { count: preview.data.budgets }),
            target: target.name,
            name: category.name,
          })}
        </p>
      )}
      {target && preview.isError && <ErrorMessage>{t('categories.errors.generic')}</ErrorMessage>}
      {refused && target && <ErrorMessage>{t('categories.merge.refused', { name: category.name, target: target.name })}</ErrorMessage>}
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={!target || !preview.data}>
          {t('categories.merge.confirm')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
      </div>
    </form>
  )
}
