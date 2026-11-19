import { zodResolver } from '@hookform/resolvers/zod'
import type { ParseKeys } from 'i18next'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { Institution, InstitutionField, InstitutionFields, SaveOutcome } from '../api/institutions'
import { paletteWith } from '@/shared/ui/palette'
import { logos } from './institutionLook'

const schema = z.object({
  name: z.string().trim().min(1, { error: 'institutions.errors.nameRequired' }).max(100, { error: 'institutions.errors.nameTooLong' }),
  // '' is "none".
  color: z.string(),
  logoKey: z.string(),
})

type Values = z.infer<typeof schema>

const serverErrors: Record<InstitutionField, ParseKeys> = {
  name: 'institutions.errors.nameTooLong',
  color: 'institutions.errors.color',
  logoKey: 'institutions.errors.logo',
}

type Props = {
  /** The institution being edited; none when adding one. */
  institution?: Institution
  onSave: (fields: InstitutionFields) => Promise<SaveOutcome>
  onDone: () => void
}

/** Adds or edits an institution: a name, and optionally a colour and a logo. */
export function InstitutionForm({ institution, onSave, onDone }: Props) {
  const { t } = useTranslation()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: institution?.name ?? '', color: institution?.color ?? '', logoKey: institution?.logoKey ?? '' },
  })
  const { errors, isSubmitting } = form.formState
  // A colour set some other way than this form stays on offer, so editing does not lose it.
  const colorOptions = paletteWith(institution?.color)

  const onSubmit = form.handleSubmit(async (values) => {
    const outcome = await onSave({ name: values.name, color: values.color || null, logoKey: values.logoKey || null })
    if (outcome.saved) {
      onDone()
      return
    }
    for (const field of outcome.fields) form.setError(field, { message: serverErrors[field] }, { shouldFocus: true })
  })

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 rounded-lg border p-4">
      <TextField
        label={t('institutions.name')}
        autoComplete="off"
        error={errors.name?.message && t(errors.name.message as ParseKeys)}
        {...form.register('name')}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('institutions.color')}</legend>
        <div className="flex flex-wrap gap-2">
          <Choice label={t('institutions.none')} value="" {...form.register('color')}>
            <span className="size-6 rounded-full border border-dashed" />
          </Choice>
          {colorOptions.map((color) => (
            <Choice key={color.value} label={t(color.label)} value={color.value} hideLabel {...form.register('color')}>
              <span className="size-6 rounded-full" style={{ backgroundColor: color.value }} />
            </Choice>
          ))}
        </div>
        {errors.color?.message && <p className="text-sm text-destructive">{t(errors.color.message as ParseKeys)}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('institutions.logo')}</legend>
        <div className="flex flex-wrap gap-2">
          <Choice label={t('institutions.none')} value="" {...form.register('logoKey')} />
          {logos.map(({ key, label, Icon }) => (
            <Choice key={key} label={t(label)} value={key} {...form.register('logoKey')}>
              <Icon aria-hidden className="size-4" />
            </Choice>
          ))}
        </div>
        {errors.logoKey?.message && <p className="text-sm text-destructive">{t(errors.logoKey.message as ParseKeys)}</p>}
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {t('institutions.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('institutions.cancel')}
        </Button>
      </div>
    </form>
  )
}

type ChoiceProps = React.ComponentProps<'input'> & { label: string; hideLabel?: boolean; children?: React.ReactNode }

/** One radio option drawn as a chip; the radio itself is visually hidden but keeps keyboard focus. */
function Choice({ label, hideLabel, children, ...radio }: ChoiceProps) {
  return (
    <label
      title={hideLabel ? label : undefined}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-sm',
        'has-checked:border-primary has-checked:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
      )}
    >
      <input type="radio" className="sr-only" {...radio} />
      {children}
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
    </label>
  )
}
