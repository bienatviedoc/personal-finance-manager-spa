import type { ParseKeys } from 'i18next'
import { Gauge, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import type { BudgetPace } from '../api/budgets'

/**
 * How a pace is shown (spec BUD-6): in words beside an icon, ahead of pace in the colour of a warning, which only
 * adds to the words.
 */
const paces: Record<BudgetPace, { label: ParseKeys; icon: LucideIcon; text: string }> = {
  onPace: { label: 'budgets.pace.onPace', icon: Gauge, text: 'text-muted-foreground' },
  aheadOfPace: { label: 'budgets.pace.aheadOfPace', icon: Gauge, text: 'text-warning' },
}

/** Whether the budget is spent faster than the month is passing. Only the current month has a pace: a past month shows its final result. */
export function PaceLabel({ pace }: { pace: BudgetPace }) {
  const { t } = useTranslation()
  const { label, icon: Icon, text } = paces[pace]

  return (
    <p className={cn('inline-flex items-center gap-1 text-sm font-medium', text)}>
      <Icon aria-hidden className="size-4" />
      {t(label)}
    </p>
  )
}
