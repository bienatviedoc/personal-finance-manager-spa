import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import type { CategoryChoice } from '@/features/categories'
import { SelectField } from '@/shared/components/SelectField'
import { TextField } from '@/shared/components/TextField'
import { Button } from '@/shared/ui/button'
import { matchTypes, type CategorisationRuleField, type CategorisationRuleFields, type SaveOutcome } from '../api/categorisationRules'

const schema = z.object({
  matchText: z.string().trim().min(1, { error: 'categorisationRules.errors.matchTextRequired' }).max(100, { error: 'categorisationRules.errors.matchTextTooLong' }),
  matchType: z.enum(matchTypes),
  categoryId: z.string().min(1, { error: 'categorisationRules.errors.categoryRequired' }),
  // Left empty, the API places a new rule above every other, and an edited one keeps its own.
  priority: z.string().regex(/^\d{0,7}$/, { error: 'categorisationRules.errors.priority' }).refine((text) => text === '' || Number(text) <= 1_000_000, { error: 'categorisationRules.errors.priority' }),
})

type Values = z.infer<typeof schema>

/** The screen's own message for each field the API can refuse. */
const serverErrors: Record<CategorisationRuleField, { field: keyof Values; message: ParseKeys }> = {
  matchText: { field: 'matchText', message: 'categorisationRules.errors.matchTextRequired' },
  matchType: { field: 'matchType', message: 'categorisationRules.errors.matchType' },
  // Archived or gone: only reachable when the categories on screen are out of date.
  categoryId: { field: 'categoryId', message: 'categorisationRules.errors.categoryRefused' },
  priority: { field: 'priority', message: 'categorisationRules.errors.priority' },
}

type Props = {
  id?: string
  /** Already translated: names the form for assistive technology. */
  title: string
  initial: CategorisationRuleFields
  /** The categories a rule can be set up on: those not archived, and the rule's own when it has been archived since. */
  choices: CategoryChoice[]
  onSave: (values: CategorisationRuleFields) => Promise<SaveOutcome>
  onCancel: () => void
}

/** Sets up or changes a categorisation rule: what to look for, how, the category it gives and its priority. */
export function CategorisationRuleForm({ id, title, initial, choices, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...initial, priority: initial.priority === null ? '' : String(initial.priority) },
  })
  const { errors } = form.formState
  const message = (error: { message?: string } | undefined) => error?.message && t(error.message as ParseKeys)

  useEffect(() => form.setFocus('matchText'), [form])

  const onSubmit = form.handleSubmit(async ({ priority, ...values }) => {
    // Whoever saves says that it failed; the form keeps what was entered, to be saved again.
    const outcome = await onSave({ ...values, priority: priority === '' ? null : Number(priority) }).catch(() => undefined)
    // Stale: whoever saves says so, and the form starts again from the rule as it is now.
    if (!outcome || outcome.saved || 'stale' in outcome) return
    for (const refused of outcome.fields) {
      const { field, message: refusal } = serverErrors[refused]
      form.setError(field, { message: refusal })
    }
  })

  return (
    <form id={id} aria-label={title} noValidate onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t('categorisationRules.matchText')} hint={t('categorisationRules.matchTextHint')} error={message(errors.matchText)} {...form.register('matchText')} />
        <SelectField
          label={t('categorisationRules.matchType')}
          options={matchTypes.map((type) => ({ value: type, label: t(`categorisationRules.matchTypes.${type}`) }))}
          error={message(errors.matchType)}
          {...form.register('matchType')}
        />
        <SelectField
          label={t('categorisationRules.category')}
          options={[
            { value: '', label: t('categorisationRules.chooseCategory') },
            ...choices.map((choice) => ({ value: choice.category.id, label: choice.label })),
          ]}
          error={message(errors.categoryId)}
          {...form.register('categoryId')}
        />
        <TextField
          label={t('categorisationRules.priority')}
          hint={t('categorisationRules.priorityHint')}
          type="number"
          min={0}
          max={1_000_000}
          step={1}
          inputMode="numeric"
          error={message(errors.priority)}
          {...form.register('priority')}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('categorisationRules.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categorisationRules.cancel')}
        </Button>
      </div>
    </form>
  )
}
