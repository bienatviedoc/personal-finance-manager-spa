import type { TFunction } from 'i18next'
import type { Category } from '@/features/categories'
import { isSplit, type ListedTransaction } from '../api/transactions'

/** What a transaction is named by, as any screen has it: its payee, its type, whether it is split, and its category's name. */
export type TitleParts = { payee: string | null; type: ListedTransaction['type']; isSplit: boolean; categoryName?: string }

/**
 * What a transaction is known by: who was paid; without a payee, what it was for (its category, or that it is
 * split, being for several things); without either, its type.
 */
export const titleOf = ({ payee, type, isSplit, categoryName }: TitleParts, t: TFunction) =>
  payee ?? (isSplit ? t('transactions.split.transaction') : categoryName) ?? t(`transactions.types.${type}`)

/** What a transaction the API answers is known by, its category found among the user's. */
export const transactionTitle = (transaction: ListedTransaction, category: Category | undefined, t: TFunction) =>
  titleOf({ payee: transaction.payee, type: transaction.type, isSplit: isSplit(transaction), categoryName: category?.name }, t)
