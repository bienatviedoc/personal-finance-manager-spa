import { useTranslation } from 'react-i18next'
import type { Account } from './api/accounts'

/** The accounts as a picker offers them, each named with its currency, which decides the decimals of an amount on it. */
export function useAccountChoices(accounts: Account[]): { value: string; label: string }[] {
  const { t } = useTranslation()
  return accounts.map((account) => ({ value: account.id, label: t('accounts.option', { name: account.name, currency: account.currency }) }))
}
