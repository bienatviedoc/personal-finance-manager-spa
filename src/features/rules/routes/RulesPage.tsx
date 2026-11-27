import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesQuery, CategoryBadge, findCategory, useCategoryChoices, type Category, type CategoryChoice } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { rulesQuery, useCreateRule, useDeleteRule, useEditRule, useReorderRules, type Rule, type RuleFields } from '../api/rules'
import { RuleForm } from '../components/RuleForm'

/** What the form is open for, if anything: a new rule, or one to edit. */
type Editing = { rule: Rule | null }

// Built outside JSX, where lint would take the values for user-facing text.
const newRule: Editing = { rule: null }
const emptyRule: RuleFields = { matchText: '', matchType: 'contains', categoryId: '', priority: null }

/**
 * Settings > Rules, a section of the settings screen: the user's categorisation rules (spec IMP-4), in the order
 * they are tried, and every change to them. Moving a rule up or down sends the whole new order.
 */
export function RulesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('rules.title'))
  const rules = useQuery(rulesQuery)
  // Archived categories too, to name the category of a rule that still has one.
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const allChoices = useCategoryChoices(categories.data ?? [])
  const [editing, setEditing] = useState<Editing | null>(null)
  const create = useCreateRule()
  const edit = useEditRule()
  const remove = useDeleteRule()
  const reorder = useReorderRules()
  const formId = useId()
  const save = create.isError ? create : edit

  const listed = rules.data ?? []
  const move = (from: number, to: number) => {
    const ids = listed.map((rule) => rule.id)
    ;[ids[from], ids[to]] = [ids[to]!, ids[from]!]
    reorder.mutate(ids)
  }

  const form = (() => {
    if (!editing) return null
    const close = () => setEditing(null)
    const { rule } = editing
    // A rule may keep a category archived since, but not move to another archived one.
    const choices = allChoices.filter((choice) => !choice.category.isArchived || choice.category.id === rule?.categoryId)
    return (
      <RuleForm
        id={formId}
        key={rule?.id ?? 'new'}
        title={t(rule ? 'rules.editTitle' : 'rules.newTitle')}
        initial={rule ? { ...rule, priority: Number(rule.priority) } : emptyRule}
        choices={choices}
        onSave={async (values) => {
          const outcome = await (rule ? edit.mutateAsync({ ...values, id: rule.id }) : create.mutateAsync(values))
          if (outcome.saved) close()
          return outcome
        }}
        onCancel={close}
      />
    )
  })()

  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t('rules.title')}</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing(newRule)}>
          {t('rules.add')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('rules.intro')}</p>

      {rules.isError && <ErrorMessage>{t('rules.errors.generic')}</ErrorMessage>}
      <FailureToast failed={save.isError} message={t('rules.errors.generic')} retry={{ form: formId }} onDismiss={save.reset} />
      <FailureToast
        failed={remove.isError}
        message={t('rules.errors.generic')}
        retry={() => remove.variables !== undefined && remove.mutate(remove.variables)}
        onDismiss={remove.reset}
      />
      <FailureToast
        failed={reorder.isError}
        message={t('rules.errors.generic')}
        retry={() => reorder.variables !== undefined && reorder.mutate(reorder.variables)}
        onDismiss={reorder.reset}
      />

      {form}

      {rules.data &&
        (listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('rules.empty')}</p>
        ) : (
          <ol aria-label={t('rules.list')} className="divide-y rounded-lg border">
            {listed.map((rule, index) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                category={findCategory(categories.data ?? [], rule.categoryId)}
                choices={allChoices}
                busy={reorder.isPending}
                onUp={index > 0 ? () => move(index, index - 1) : undefined}
                onDown={index < listed.length - 1 ? () => move(index, index + 1) : undefined}
                onEdit={() => setEditing({ rule })}
                onDelete={() => remove.mutateAsync(rule.id)}
              />
            ))}
          </ol>
        ))}
    </section>
  )
}

function RuleRow({
  rule,
  category,
  choices,
  busy,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  rule: Rule
  category: Category | undefined
  choices: CategoryChoice[]
  busy: boolean
  onUp?: () => void
  onDown?: () => void
  onEdit: () => void
  onDelete: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const name = t(`rules.named.${rule.matchType}`, { text: rule.matchText })
  const label = choices.find((choice) => choice.category.id === rule.categoryId)?.label

  return (
    <li aria-label={name} className="space-y-2 p-3">
      {/* The actions wrap under the rule they do not fit beside, so a phone never scrolls sideways. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-24 flex-1 break-words font-medium">{name}</span>
        <span className="flex items-center gap-2 text-sm">
          {category && <CategoryBadge icon={category.icon} color={category.color} />}
          <span>{label ?? t('rules.unknownCategory')}</span>
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">{t('rules.priorityOf', { priority: rule.priority })}</span>
      </div>
      {category?.isArchived && <p className="text-sm text-warning">{t('rules.categoryArchived')}</p>}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" aria-label={t('rules.moveUp', { name })} disabled={!onUp || busy} onClick={onUp}>
          {t('rules.up')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('rules.moveDown', { name })} disabled={!onDown || busy} onClick={onDown}>
          {t('rules.down')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('rules.editAction', { name })} onClick={onEdit}>
          {t('rules.edit')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('rules.deleteAction', { name })} onClick={() => setConfirming(true)}>
          {t('rules.delete')}
        </Button>
      </div>
      {confirming && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('rules.deleteConfirm', { name })}</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void onDelete().finally(() => setConfirming(false))}>
              {t('rules.deleteRule')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('rules.cancel')}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
