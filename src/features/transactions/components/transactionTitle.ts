import type { TFunction } from 'i18next'
import type { Category } from '@/features/categories'
import { isSplit, type ListedTransaction } from '../api/transactions'

/**
 * What a transaction is known by: who was paid; without a payee, what it was for (its category, or that it is
 * split, being for several things); without either, its type.
 */
export const transactionTitle = (transaction: ListedTransaction, category: Category | undefined, t: TFunction) =>
  transaction.payee ?? (isSplit(transaction) ? t('transactions.split.transaction') : category?.name) ?? t(`transactions.types.${transaction.type}`)
