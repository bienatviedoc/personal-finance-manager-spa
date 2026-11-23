import { useQuery } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { FailureToast } from '@/shared/components/FailureToast'
import { useLocale } from '@/shared/i18n/useLocale'
import { cn, focusRing } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import {
  attachmentTypes,
  attachmentsQuery,
  useAddAttachment,
  useOpenAttachment,
  useRemoveAttachment,
  whyNotAttachable,
  type Attachment,
} from '../api/attachments'

/** A file the screen or the API would not take, and why. */
type Refusal = { name: string; why: 'type' | 'tooLarge' | 'empty' | 'refused' }

/**
 * The receipts attached to a transaction, in its drawer: attach one (a JPEG, PNG or PDF of at most 5 MB), open
 * one, remove one (spec TXN-6). Only a transaction the API has recorded has any.
 */
export function Attachments({ transactionId }: { transactionId: string }) {
  const { t } = useTranslation()
  const headingId = useId()
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const attachments = useQuery(attachmentsQuery(transactionId))
  const add = useAddAttachment(transactionId)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  // The file last sent, to send again when the request failed.
  const [sent, setSent] = useState<File | null>(null)

  const attach = async (file: File) => {
    setSent(file)
    const why = whyNotAttachable(file)
    if (why) {
      setRefusal({ name: file.name, why })
      return
    }
    setRefusal(null)
    // A request that failed is shown by the toast below.
    const outcome = await add.mutateAsync(file).catch(() => undefined)
    if (outcome && !outcome.saved) setRefusal({ name: file.name, why: 'refused' })
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-4">
      <h3 id={headingId} className="font-medium">
        {t('attachments.title')}
      </h3>

      {attachments.isError && <ErrorMessage>{t('attachments.errors.notLoaded')}</ErrorMessage>}
      {attachments.isPending && <p className="text-sm text-muted-foreground">{t('attachments.loading')}</p>}
      {attachments.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('attachments.none')}</p>}
      {attachments.data && attachments.data.length > 0 && (
        <ul aria-labelledby={headingId} className="divide-y rounded-lg border">
          {attachments.data.map((attachment) => (
            <AttachmentRow key={attachment.id} attachment={attachment} />
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{t('attachments.attach')}</Label>
        <Input
          id={inputId}
          type="file"
          accept={attachmentTypes.join(',')}
          disabled={add.isPending}
          aria-invalid={refusal ? true : undefined}
          aria-describedby={[hintId, refusal && errorId].filter(Boolean).join(' ')}
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Emptied, so choosing the same file again is a change too.
            event.target.value = ''
            if (file) void attach(file)
          }}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {add.isPending && sent ? t('attachments.attaching', { name: sent.name }) : t('attachments.hint')}
        </p>
        {refusal && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t(`attachments.errors.${refusal.why}`, { name: refusal.name })}
          </p>
        )}
      </div>
      <FailureToast
        failed={add.isError}
        message={t('attachments.errors.notAttached')}
        retry={() => sent && void attach(sent)}
        onDismiss={add.reset}
      />
    </section>
  )
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const open = useOpenAttachment()
  const remove = useRemoveAttachment(attachment.transactionId)
  const [confirming, setConfirming] = useState(false)
  const name = attachment.fileName

  return (
    <li className="space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          className={cn('flex min-w-24 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-muted', focusRing)}
          aria-label={t('attachments.openNamed', { name })}
          disabled={open.isPending}
          onClick={() => open.mutate(attachment.id)}
        >
          <Paperclip aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span data-testid="name" className="break-all underline">
            {name}
          </span>
        </button>
        <span data-testid="size" className="text-sm text-muted-foreground tabular-nums">
          {formatFileSize(Number(attachment.size), locale)}
        </span>
        {!confirming && (
          <Button variant="ghost" size="sm" aria-label={t('attachments.removeNamed', { name })} onClick={() => setConfirming(true)}>
            {t('attachments.remove')}
          </Button>
        )}
      </div>
      {confirming && (
        <div role="group" aria-label={t('attachments.removeNamed', { name })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm break-all">{t('attachments.removeExplained', { name })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(attachment.id)}>
              {t('attachments.removeConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              {t('attachments.cancel')}
            </Button>
          </div>
        </div>
      )}
      <FailureToast failed={open.isError} message={t('attachments.errors.notOpened')} retry={() => open.mutate(attachment.id)} onDismiss={open.reset} />
      <FailureToast
        failed={remove.isError}
        message={t('attachments.errors.notRemoved')}
        retry={() => remove.mutate(attachment.id)}
        onDismiss={remove.reset}
      />
    </li>
  )
}

/** A file's size in the largest unit that keeps it readable, written in the interface's locale: 300 byte, 47 kB, 1.5 MB. */
function formatFileSize(bytes: number, locale: string) {
  const [unit, value, digits] =
    bytes < 1024 ? (['byte', bytes, 0] as const) : bytes < 1024 * 1024 ? (['kilobyte', bytes / 1024, 0] as const) : (['megabyte', bytes / (1024 * 1024), 1] as const)
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: digits }).format(value)
}
