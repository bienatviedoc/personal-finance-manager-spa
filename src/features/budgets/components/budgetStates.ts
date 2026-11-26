import type { ParseKeys } from 'i18next'
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { BudgetState } from '../api/budgets'

/**
 * How a budget's state is shown wherever it is (spec section 8): in words, beside an icon of its own shape, and in
 * a colour that only adds to them, for its text (`text`) and its progress bar (`bar`).
 */
export const budgetStates: Record<BudgetState, { label: ParseKeys; icon: LucideIcon; text: string; bar: string }> = {
  onTrack: { label: 'budgets.states.onTrack', icon: CircleCheck, text: 'text-success', bar: 'bg-success' },
  warning: { label: 'budgets.states.warning', icon: TriangleAlert, text: 'text-warning', bar: 'bg-warning' },
  over: { label: 'budgets.states.over', icon: CircleAlert, text: 'text-destructive', bar: 'bg-destructive' },
}
