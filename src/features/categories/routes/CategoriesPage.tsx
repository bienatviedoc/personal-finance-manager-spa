import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '@/shared/i18n/useLocale'
import { neutralColor } from '@/shared/lib/palette'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import {
  categoriesQuery,
  categoryKinds,
  useArchiveCategory,
  useCreateCategory,
  useEditCategory,
  type Category,
  type CategoryKind,
} from '../api/categories'
import { CategoryBadge } from '../components/CategoryBadge'
import { CategoryForm } from '../components/CategoryForm'

/** What the form is open for, if anything. */
type Editing =
  | { mode: 'new'; kind: CategoryKind }
  | { mode: 'newSubcategory'; parent: Category }
  | { mode: 'edit'; category: Category }

/** How a new top-level category looks until the user picks otherwise. */
const newCategoryLooks = { icon: 'tag', color: neutralColor }

// Built outside JSX, where lint would take the mode names for user-facing text.
const opening = {
  new: (kind: CategoryKind): Editing => ({ mode: 'new', kind }),
  newSubcategory: (parent: Category): Editing => ({ mode: 'newSubcategory', parent }),
  edit: (category: Category): Editing => ({ mode: 'edit', category }),
}

/** Settings > Categories, a section of the settings screen: the user's income and expense category trees, and every change to them. */
export function CategoriesPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  useDocumentTitle(t('categories.title'))
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const categories = useQuery(categoriesQuery({ includeArchived: showArchived }))
  const create = useCreateCategory()
  const edit = useEditCategory()
  const archive = useArchiveCategory()

  const collator = new Intl.Collator(locale)
  const byName = (a: Category, b: Category) => collator.compare(a.name, b.name)

  const form = (() => {
    if (!editing) return null
    const close = () => setEditing(null)
    const closeWhenSaved = async <T extends { saved: boolean }>(outcome: Promise<T>) => {
      const result = await outcome
      if (result.saved) close()
      return result
    }

    switch (editing.mode) {
      case 'new':
        return (
          <CategoryForm
            key={`new-${editing.kind}`}
            title={t(`categories.new.${editing.kind}`)}
            initial={{ ...newCategoryLooks, name: '', kind: editing.kind }}
            kindFixed={false}
            onSave={(values) => closeWhenSaved(create.mutateAsync({ ...values, parentId: null }))}
            onCancel={close}
          />
        )
      case 'newSubcategory': {
        const { parent } = editing
        return (
          <CategoryForm
            key={`sub-${parent.id}`}
            title={t('categories.newSubcategory', { name: parent.name })}
            initial={{ name: '', kind: parent.kind, icon: parent.icon, color: parent.color }}
            kindFixed
            onSave={(values) => closeWhenSaved(create.mutateAsync({ ...values, parentId: parent.id }))}
            onCancel={close}
          />
        )
      }
      case 'edit': {
        const { category } = editing
        const isSubcategory = category.parentId !== null
        return (
          <CategoryForm
            key={`edit-${category.id}`}
            title={t('categories.editTitle', { name: category.name })}
            initial={{ name: category.name, kind: category.kind, icon: category.icon, color: category.color }}
            kindFixed={isSubcategory}
            kindHint={category.subcategories.length > 0 ? t('categories.kindHint') : undefined}
            onSave={(values) => closeWhenSaved(edit.mutateAsync({ ...values, id: category.id }))}
            onCancel={close}
          />
        )
      }
    }
  })()

  return (
    <section className="max-w-3xl space-y-6">
      <h2 className="text-xl font-semibold">{t('categories.title')}</h2>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        {t('categories.showArchived')}
      </label>

      {(create.isError || edit.isError || archive.isError || categories.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {t('categories.errors.generic')}
        </p>
      )}

      {form}

      {categories.data &&
        categoryKinds.map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            categories={categories.data.filter((category) => category.kind === kind).sort(byName)}
            byName={byName}
            onAdd={() => setEditing(opening.new(kind))}
            onAddSubcategory={(parent) => setEditing(opening.newSubcategory(parent))}
            onEdit={(category) => setEditing(opening.edit(category))}
            onArchive={(category) => archive.mutateAsync(category.id)}
          />
        ))}
    </section>
  )
}

type RowActions = {
  onAddSubcategory: (parent: Category) => void
  onEdit: (category: Category) => void
  onArchive: (category: Category) => Promise<unknown>
}

function KindSection({
  kind,
  categories,
  byName,
  onAdd,
  ...actions
}: RowActions & { kind: CategoryKind; categories: Category[]; byName: (a: Category, b: Category) => number; onAdd: () => void }) {
  const { t } = useTranslation()
  const headingId = useId()

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id={headingId} className="text-lg font-semibold">
          {t(`categories.sections.${kind}`)}
        </h3>
        <Button variant="outline" size="sm" onClick={onAdd}>
          {t(`categories.add.${kind}`)}
        </Button>
      </div>
      <ul aria-labelledby={headingId} className="divide-y rounded-lg border">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} {...actions}>
            {category.subcategories.length > 0 && (
              <ul aria-label={t('categories.subcategoriesOf', { name: category.name })} className="mt-2 space-y-2 pl-9">
                {[...category.subcategories].sort(byName).map((subcategory) => (
                  <CategoryRow key={subcategory.id} category={subcategory} {...actions} />
                ))}
              </ul>
            )}
          </CategoryRow>
        ))}
      </ul>
    </section>
  )
}

function CategoryRow({ category, onAddSubcategory, onEdit, onArchive, children }: RowActions & { category: Category; children?: ReactNode }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const isTopLevel = category.parentId === null

  return (
    <li aria-label={category.name} className={isTopLevel ? 'p-3' : undefined}>
      {/* The actions wrap under a name they do not fit beside, so a phone never scrolls sideways. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CategoryBadge icon={category.icon} color={category.color} />
        <span className="min-w-24 flex-1 break-words">{category.name}</span>
        {category.isArchived ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('categories.archived')}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" aria-label={t('categories.editAction', { name: category.name })} onClick={() => onEdit(category)}>
              {t('categories.edit')}
            </Button>
            {isTopLevel && (
              <Button variant="ghost" size="sm" aria-label={t('categories.addSubcategoryAction', { name: category.name })} onClick={() => onAddSubcategory(category)}>
                {t('categories.addSubcategory')}
              </Button>
            )}
            <Button variant="ghost" size="sm" aria-label={t('categories.archiveAction', { name: category.name })} onClick={() => setConfirming(true)}>
              {t('categories.archive')}
            </Button>
          </div>
        )}
      </div>
      {confirming && (
        <div className="mt-2 space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">
            {t(isTopLevel ? 'categories.archiveConfirmWithSubcategories' : 'categories.archiveConfirm', { name: category.name })}
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void onArchive(category).finally(() => setConfirming(false))}>
              {t('categories.archive')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('categories.cancel')}
            </Button>
          </div>
        </div>
      )}
      {children}
    </li>
  )
}
