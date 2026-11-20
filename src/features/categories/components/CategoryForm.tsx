import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { paletteWith } from '@/shared/lib/palette'
import { cn, focusRingWithin } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { categoryKinds, type CategoryField, type CategoryFields, type SaveOutcome } from '../api/categories'
import { categoryIcons } from './appearance'
import { ErrorMessage } from '@/shared/components/ErrorMessage'

const schema = z.object({
  name: z.string().trim().min(1, { error: 'categories.errors.nameRequired' }).max(100, { error: 'categories.errors.nameTooLong' }),
  kind: z.enum(categoryKinds),
  icon: z.string().min(1),
  color: z.string().min(1),
})

type Values = z.infer<typeof schema>

/** The screen's own message for each field the API can refuse. */
const serverErrors: Record<CategoryField, { field: keyof Values; message: ParseKeys }> = {
  name: { field: 'name', message: 'categories.errors.nameRequired' },
  kind: { field: 'kind', message: 'categories.errors.kindLocked' },
  icon: { field: 'icon', message: 'categories.errors.iconRequired' },
  color: { field: 'color', message: 'categories.errors.colorRequired' },
  // Too deep, archived or gone: all only reachable when the tree on screen is out of date.
  parentId: { field: 'name', message: 'categories.errors.parentRefused' },
}

type Props = {
  /** Already translated: names the form for assistive technology. */
  title: string
  initial: CategoryFields
  /** Subcategories always have their parent's kind, so their form does not offer it. */
  kindFixed: boolean
  /** Shown under the kind choice, already translated. */
  kindHint?: string
  onSave: (values: CategoryFields) => Promise<SaveOutcome>
  onCancel: () => void
}

/** Adds or changes a category: its name, kind, icon and colour. */
export function CategoryForm({ title, initial, kindFixed, kindHint, onSave, onCancel }: Props) {
  const { t } = useTranslation()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial })
  const { errors } = form.formState
  const kindHintId = useId()

  useEffect(() => form.setFocus('name'), [form])

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await onSave(values)
    if (outcome.saved) return
    for (const refused of outcome.fields) {
      const { field, message } = serverErrors[refused]
      form.setError(field, { message })
    }
  })

  const colors = paletteWith(initial.color)

  return (
    <form aria-label={title} noValidate onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <TextField label={t('categories.name')} error={errors.name?.message && t(errors.name.message as ParseKeys)} {...form.register('name')} />

      {!kindFixed && (
        <fieldset className="space-y-1.5" aria-describedby={kindHint ? kindHintId : undefined}>
          <legend className="text-sm font-medium">{t('categories.kind')}</legend>
          <div className="flex gap-4">
            {categoryKinds.map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm">
                <input type="radio" value={kind} {...form.register('kind')} />
                {t(`categories.kinds.${kind}`)}
              </label>
            ))}
          </div>
          {kindHint && (
            <p id={kindHintId} className="text-sm text-muted-foreground">
              {kindHint}
            </p>
          )}
        </fieldset>
      )}
      {errors.kind?.message && <ErrorMessage>{t(errors.kind.message as ParseKeys)}</ErrorMessage>}

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t('categories.icon')}</legend>
        <div className="flex flex-wrap gap-1">
          {categoryIcons.map(({ key, Icon, label }) => (
            <label key={key} className={cn(swatch, 'text-foreground')}>
              <input type="radio" value={key} aria-label={t(label)} className="peer sr-only" {...form.register('icon')} />
              <Icon aria-hidden className="size-4" />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t('categories.color')}</legend>
        <div className="flex flex-wrap gap-1">
          {colors.map(({ value, label }) => (
            <label key={value} className={swatch}>
              <input type="radio" value={value} aria-label={t(label)} className="peer sr-only" {...form.register('color')} />
              <span aria-hidden className="size-5 rounded-full" style={{ backgroundColor: value }} />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('categories.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('categories.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** A choice shown as a small square: outlined when chosen, with a visible ring when focused by keyboard. */
const swatch = cn(
  'relative flex size-9 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-muted has-checked:border-foreground',
  focusRingWithin,
)
