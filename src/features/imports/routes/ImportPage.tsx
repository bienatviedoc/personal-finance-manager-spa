import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { accountsQuery, useAccountChoices } from '@/features/accounts'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { SelectField } from '@/shared/components/SelectField'
import { maxStatementFileSize } from '@/shared/api/limits'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { useUploadStatement, type StartAgain, type UploadField } from '../api/imports'

/** What the file picker offers: CSV files, which some systems call plain text. */
const accepted = '.csv,text/csv,text/plain'

/**
 * The first step of importing a statement (spec IMP-1): the account to import into and the CSV file. Uploading
 * imports nothing; the next screen maps the file's columns and previews it.
 */
export function ImportPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('screens.import'))
  const navigate = useNavigate()
  // Starting again after an import stopped: the account and mapping it had.
  const again = useLocation().state as StartAgain | null
  const formId = useId()
  const fileId = useId()
  const accounts = useQuery(accountsQuery())
  const choices = useAccountChoices(accounts.data?.accounts ?? [])
  const upload = useUploadStatement()
  const [accountId, setAccountId] = useState(again?.accountId ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Partial<Record<UploadField, string>>>({})

  const describedBy = [`${fileId}-hint`, errors.file && `${fileId}-error`].filter(Boolean).join(' ')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Partial<Record<UploadField, string>> = {}
    if (!accountId) found.accountId = t('imports.errors.account')
    if (!file || file.size === 0) found.file = t('imports.errors.noFile')
    else if (file.size > maxStatementFileSize) found.file = t('imports.errors.tooLarge')
    setErrors(found)
    if (Object.keys(found).length > 0 || !file) return
    // A request that failed is shown by the toast below.
    const outcome = await upload.mutateAsync({ accountId, file }).catch(() => undefined)
    if (!outcome) return
    if (outcome.saved) {
      await navigate(`/import/${outcome.batch.id}`, { state: { mapping: again?.mapping } satisfies StartAgain })
      return
    }
    setErrors(Object.fromEntries(outcome.fields.map((field) => [field, t(field === 'file' ? 'imports.errors.unreadable' : 'imports.errors.account')])))
  }

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('screens.import')}</h1>
        <p className="text-muted-foreground">{t('imports.intro')}</p>
      </div>
      {accounts.isError && <ErrorMessage>{t('imports.errors.generic')}</ErrorMessage>}
      <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)} aria-label={t('imports.upload')} className="space-y-4 rounded-lg border p-4">
        <SelectField
          label={t('imports.account')}
          options={[{ value: '', label: t('imports.chooseAccount') }, ...choices]}
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          error={errors.accountId}
        />
        <div className="space-y-1.5">
          <Label htmlFor={fileId}>{t('imports.file')}</Label>
          <Input
            id={fileId}
            type="file"
            accept={accepted}
            aria-invalid={errors.file ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p id={`${fileId}-hint`} className="text-sm text-muted-foreground">
            {t('imports.fileHint')}
          </p>
          {errors.file && (
            <p id={`${fileId}-error`} className="text-sm text-destructive">
              {errors.file}
            </p>
          )}
        </div>
        <Button type="submit" disabled={upload.isPending}>
          {t('imports.upload')}
        </Button>
        <FailureToast failed={upload.isError} message={t('imports.errors.notUploaded')} retry={{ form: formId }} onDismiss={upload.reset} />
      </form>
    </section>
  )
}
