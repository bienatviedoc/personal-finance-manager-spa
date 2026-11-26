import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUserSettings } from '@/features/settings'
import { FailureToast } from '@/shared/components/FailureToast'
import { SelectField } from '@/shared/components/SelectField'
import { formatMonth, monthOf, shiftMonth, todayIn, type CalendarMonth } from '@/shared/dates'
import { useLocale } from '@/shared/i18n/useLocale'
import { Button } from '@/shared/ui/button'
import { useDownloadMonthlySummary } from '../api/monthlySummary'

/** How many months back, before this one, a summary can be chosen for: two years. */
const monthsBack = 24

/**
 * The monthly summary (spec section 7, export): a month to choose, this one first, and a button that downloads
 * its summary as a PDF in the language the interface is in.
 */
export function MonthlySummaryDownload() {
  const { t } = useTranslation()
  const locale = useLocale()
  const headingId = useId()
  const { timeZone } = useUserSettings()
  const thisMonth = monthOf(todayIn(timeZone))
  const months = Array.from({ length: monthsBack + 1 }, (_, back) => shiftMonth(thisMonth, -back))
  const [chosen, setChosen] = useState<CalendarMonth | undefined>()
  const month = chosen ?? thisMonth
  const download = useDownloadMonthlySummary()

  const start = () => {
    download.reset()
    download.mutate({ month, locale })
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-md border p-4">
      <h2 id={headingId} className="font-semibold">
        {t('reports.monthlySummary.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('reports.monthlySummary.body')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label={t('reports.monthlySummary.month')}
          value={month}
          onChange={(event) => {
            download.reset()
            setChosen(months.find((each) => each === event.target.value))
          }}
          options={months.map((each) => ({ value: each, label: formatMonth(each, locale) }))}
          className="w-48"
        />
        <Button type="button" disabled={download.isPending} onClick={start}>
          {t('reports.monthlySummary.download')}
        </Button>
      </div>
      <FailureToast failed={download.isError} message={t('reports.monthlySummary.failed')} retry={start} onDismiss={download.reset} />
      {download.isSuccess && (
        <p role="status" className="text-sm">
          {t('reports.monthlySummary.downloaded')}
        </p>
      )}
    </section>
  )
}
