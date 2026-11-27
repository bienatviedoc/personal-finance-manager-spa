import { useInfiniteQuery } from '@tanstack/react-query'
import type { ParseKeys } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ErrorMessage } from '@/shared/components/ErrorMessage'
import { formatMoment } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { Button } from '@/shared/ui/button'
import { auditLogQuery, type AuditAction, type AuditEntry } from '../api/auditLog'
import { useUserSettings } from '../api/profile'

/** What each action is called in the log; the API's summary says the rest. */
const actionLabels: Record<AuditAction, ParseKeys> = {
  signIn: 'settings.auditLog.actions.signIn',
  importCommit: 'settings.auditLog.actions.importCommit',
  importUndo: 'settings.auditLog.actions.importUndo',
  bulkEdit: 'settings.auditLog.actions.bulkEdit',
  bulkDelete: 'settings.auditLog.actions.bulkDelete',
  delete: 'settings.auditLog.actions.delete',
  deletionRequest: 'settings.auditLog.actions.deletionRequest',
}

/**
 * The user's audit log (spec section 8, Auditability): each sign-in, statement committed, import undone, bulk action
 * and delete, the newest first, with when it happened in the user's time zone and the API's summary of it. Read only.
 */
export function AuditLogSettingsPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('settings.auditLog.title'))
  const log = useInfiniteQuery(auditLogQuery)
  const entries = log.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">{t('settings.auditLog.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.auditLog.body')}</p>
      {log.isError && <ErrorMessage>{t('settings.auditLog.notLoaded')}</ErrorMessage>}
      {log.data && entries.length === 0 && <p className="text-muted-foreground">{t('settings.auditLog.empty')}</p>}
      {entries.length > 0 && (
        <ul aria-label={t('settings.auditLog.title')} className="divide-y rounded-lg border">
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {log.hasNextPage && (
        <Button variant="outline" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
          {t('settings.auditLog.more')}
        </Button>
      )}
    </div>
  )
}

function Entry({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { timeZone } = useUserSettings()
  const at = formatMoment(entry.at, locale, timeZone)

  return (
    <li className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-baseline sm:gap-4">
      <time dateTime={entry.at} className="shrink-0 text-sm text-muted-foreground tabular-nums sm:w-44">
        {at}
      </time>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{t(actionLabels[entry.action])}</span>
        <span className="block text-sm">{entry.summary}</span>
      </span>
    </li>
  )
}
