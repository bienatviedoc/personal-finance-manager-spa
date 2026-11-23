import { Repeat } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { cn, focusRing } from '@/shared/lib/utils'

/** The name of the query parameter that says which rule the recurring screen should point out. */
export const linkedRuleParameter = 'rule'

/** On a transaction a recurring rule posted: the way back to that rule on the recurring screen. */
export function RecurringRuleLink({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to={{ pathname: '/recurring', search: new URLSearchParams({ [linkedRuleParameter]: ruleId }).toString() }}
      className={cn('inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground underline', focusRing)}
    >
      <Repeat aria-hidden className="size-3.5" />
      {t('recurring.postedByRule')}
    </Link>
  )
}
