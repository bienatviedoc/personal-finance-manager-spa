import { useTranslation } from 'react-i18next'
import { AmountInput, type Currency } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import type { useBudgetAmount } from '../hooks/useBudgetAmount'

type Props = {
  amount: ReturnType<typeof useBudgetAmount>
  currency: Currency
  /** Whether a save or a remove is under way. */
  busy: boolean
  /** Already translated: the amount input's, and the save and remove buttons' accessible names. */
  labels: { amount: string; save: string; remove: string }
}

/** The amount of a budget, with Save once it is changed, or Remove while it is not. */
export function BudgetAmountForm({ amount, currency, busy, labels }: Props) {
  const { t } = useTranslation()
  return (
    <form id={amount.formId} noValidate onSubmit={(event) => void amount.save(event)} className="flex flex-wrap items-center gap-2">
      <AmountInput
        className="w-36 text-right tabular-nums"
        aria-label={labels.amount}
        aria-invalid={amount.error === 'invalid' ? true : undefined}
        aria-describedby={amount.error ? amount.errorId : undefined}
        placeholder={t('budgets.noBudget')}
        currency={currency}
        value={amount.value}
        onChange={amount.change}
      />
      {amount.isDirty && (
        <Button type="submit" size="sm" disabled={busy} aria-label={labels.save}>
          {t('budgets.save')}
        </Button>
      )}
      {amount.hasBudget && !amount.isDirty && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={labels.remove} onClick={amount.remove}>
          {t('budgets.remove')}
        </Button>
      )}
    </form>
  )
}
