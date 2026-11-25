import { useTranslation } from 'react-i18next'

/**
 * The flag on a figure that leaves something out: how many amounts are not converted into the base currency yet,
 * and so are not in it (spec section 3, rule 7). Nothing when the figure is complete.
 */
export function NotConverted({ count, short = false }: { count: number; short?: boolean }) {
  const { t } = useTranslation()
  if (count === 0) return null

  return (
    <span role="note" className={short ? 'block text-xs font-medium text-warning' : 'block text-sm font-medium'}>
      {t(short ? 'reports.notConvertedShort' : 'reports.notConverted', { count })}
    </span>
  )
}
