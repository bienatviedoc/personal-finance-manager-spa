import { useTranslation } from 'react-i18next'
import type { Currency } from '@/shared/money'
import type { Account } from './api/accounts'

/** The accounts as a picker offers them, each named with its currency, which decides the decimals of an amount on it. */
export function useAccountChoices(accounts: Account[]): { value: string; label: string }[] {
  const { t } = useTranslation()
  return accounts.map((account) => ({ value: account.id, label: t('accounts.option', { name: account.name, currency: account.currency }) }))
}

/** The account with that id, if the user has it. */
export function findAccount(accounts: readonly Account[], id: string | null | undefined): Account | undefined {
  return id ? accounts.find((account) => account.id === id) : undefined
}

/** The currency of the account with that id, or the fallback while none is chosen: it decides the decimals of an amount. */
export function currencyOf(accounts: readonly Account[], id: string | null | undefined, fallback: Currency): Currency {
  return findAccount(accounts, id)?.currency ?? fallback
}
