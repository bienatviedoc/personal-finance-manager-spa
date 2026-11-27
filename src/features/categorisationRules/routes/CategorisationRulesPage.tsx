import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoriesQuery, CategoryBadge, findCategory, useCategoryChoices, type Category, type CategoryChoice } from '@/features/categories'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { isStale } from '@/shared/api/versionedSave'
import {
  categorisationRulesQuery,
  useCreateCategorisationRule,
  useDeleteCategorisationRule,
  useEditCategorisationRule,
  useReorderCategorisationRules,
  type CategorisationRule,
  type CategorisationRuleFields,
} from '../api/categorisationRules'
import { CategorisationRuleForm } from '../components/CategorisationRuleForm'

/** What the form is open for, if anything: a new rule, or the one to edit, by its id, as it is listed now. */
type Editing = { ruleId: string | null }

// Built outside JSX, where lint would take the values for user-facing text.
const newRule: Editing = { ruleId: null }
const emptyRule: CategorisationRuleFields = { matchText: '', matchType: 'contains', categoryId: '', priority: null }

/**
 * Settings > Rules, a section of the settings screen: the user's categorisation rules (spec IMP-4), in the order
 * they are tried, and every change to them. Moving a rule up or down sends the whole new order.
 */
export function CategorisationRulesPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('categorisationRules.title'))
  const rules = useQuery(categorisationRulesQuery)
  // Archived categories too, to name the category of a rule that still has one.
  const categories = useQuery(categoriesQuery({ includeArchived: true }))
  const allChoices = useCategoryChoices(categories.data ?? [])
  const [editing, setEditing] = useState<Editing | null>(null)
  const remove = useDeleteCategorisationRule()
  const reorder = useReorderCategorisationRules()

  const listed = rules.data ?? []
  const move = (from: number, to: number) => {
    const order = [...listed]
    ;[order[from], order[to]] = [order[to]!, order[from]!]
    reorder.mutate(order)
  }

  const form = (() => {
    if (!editing) return null
    const close = () => setEditing(null)
    const rule = editing.ruleId === null ? null : listed.find((candidate) => candidate.id === editing.ruleId)
    // Deleted somewhere else meanwhile: there is nothing left to edit.
    if (rule === undefined) return null
    // A rule may keep a category archived since, but not move to another archived one.
    const choices = allChoices.filter((choice) => !choice.category.isArchived || choice.category.id === rule?.categoryId)
    return rule ? <EditRule key={rule.id} rule={rule} choices={choices} onClose={close} /> : <AddRule choices={choices} onClose={close} />
  })()

  return (
    <section className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{t('categorisationRules.title')}</h2>
        <Button variant="outline" size="sm" onClick={() => setEditing(newRule)}>
          {t('categorisationRules.add')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('categorisationRules.intro')}</p>

      {rules.isError && <ErrorMessage>{t('categorisationRules.errors.generic')}</ErrorMessage>}
      {reorder.data?.reordered === false && <ErrorMessage>{t('categorisationRules.errors.orderStale')}</ErrorMessage>}
      <FailureToast
        failed={remove.isError}
        message={t('categorisationRules.errors.generic')}
        retry={() => remove.variables !== undefined && remove.mutate(remove.variables)}
        onDismiss={remove.reset}
      />
      <FailureToast
        failed={reorder.isError}
        message={t('categorisationRules.errors.generic')}
        retry={() => reorder.variables !== undefined && reorder.mutate(reorder.variables)}
        onDismiss={reorder.reset}
      />

      {form}

      {rules.data &&
        (listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('categorisationRules.empty')}</p>
        ) : (
          <ol aria-label={t('categorisationRules.list')} className="divide-y rounded-lg border">
            {listed.map((rule, index) => (
              <CategorisationRuleRow
                key={rule.id}
                rule={rule}
                category={findCategory(categories.data ?? [], rule.categoryId)}
                choices={allChoices}
                busy={reorder.isPending}
                onUp={index > 0 ? () => move(index, index - 1) : undefined}
                onDown={index < listed.length - 1 ? () => move(index, index + 1) : undefined}
                onEdit={() => setEditing({ ruleId: rule.id })}
                onDelete={() => remove.mutateAsync(rule.id)}
              />
            ))}
          </ol>
        ))}
    </section>
  )
}

type FormProps = { choices: CategoryChoice[]; onClose: () => void }

function AddRule({ choices, onClose }: FormProps) {
  const { t } = useTranslation()
  const formId = useId()
  const create = useCreateCategorisationRule()

  return (
    <>
      <CategorisationRuleForm
        id={formId}
        title={t('categorisationRules.newTitle')}
        initial={emptyRule}
        choices={choices}
        onSave={async (values) => {
          const outcome = await create.mutateAsync(values)
          if (outcome.saved) onClose()
          return outcome
        }}
        onCancel={onClose}
      />
      <FailureToast failed={create.isError} message={t('categorisationRules.errors.generic')} retry={{ form: formId }} onDismiss={create.reset} />
    </>
  )
}

function EditRule({ rule, choices, onClose }: FormProps & { rule: CategorisationRule }) {
  const { t } = useTranslation()
  const formId = useId()
  const edit = useEditCategorisationRule(rule)

  return (
    <>
      {isStale(edit.data) && <ErrorMessage>{t('categorisationRules.errors.stale')}</ErrorMessage>}
      {/* A new row version is a new rule to edit: the form starts again from what the API holds now. */}
      <CategorisationRuleForm
        key={rule.rowVersion}
        id={formId}
        title={t('categorisationRules.editTitle')}
        initial={{ ...rule, priority: Number(rule.priority) }}
        choices={choices}
        onSave={async (values) => {
          const outcome = await edit.mutateAsync(values)
          if (outcome.saved) onClose()
          return outcome
        }}
        onCancel={onClose}
      />
      <FailureToast failed={edit.isError} message={t('categorisationRules.errors.generic')} retry={{ form: formId }} onDismiss={edit.reset} />
    </>
  )
}

function CategorisationRuleRow({
  rule,
  category,
  choices,
  busy,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  rule: CategorisationRule
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
  const name = t(`categorisationRules.named.${rule.matchType}`, { text: rule.matchText })
  const label = choices.find((choice) => choice.category.id === rule.categoryId)?.label

  return (
    <li aria-label={name} className="space-y-2 p-3">
      {/* The actions wrap under the rule they do not fit beside, so a phone never scrolls sideways. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-24 flex-1 break-words font-medium">{name}</span>
        <span className="flex items-center gap-2 text-sm">
          {category && <CategoryBadge icon={category.icon} color={category.color} />}
          <span>{label ?? t('categorisationRules.unknownCategory')}</span>
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">{t('categorisationRules.priorityOf', { priority: rule.priority })}</span>
      </div>
      {category?.isArchived && <p className="text-sm text-warning">{t('categorisationRules.categoryArchived')}</p>}
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" aria-label={t('categorisationRules.moveUp', { name })} disabled={!onUp || busy} onClick={onUp}>
          {t('categorisationRules.up')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('categorisationRules.moveDown', { name })} disabled={!onDown || busy} onClick={onDown}>
          {t('categorisationRules.down')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('categorisationRules.editAction', { name })} onClick={onEdit}>
          {t('categorisationRules.edit')}
        </Button>
        <Button variant="ghost" size="sm" aria-label={t('categorisationRules.deleteAction', { name })} onClick={() => setConfirming(true)}>
          {t('categorisationRules.delete')}
        </Button>
      </div>
      {confirming && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('categorisationRules.deleteConfirm', { name })}</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => void onDelete().finally(() => setConfirming(false))}>
              {t('categorisationRules.deleteRule')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('categorisationRules.cancel')}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
