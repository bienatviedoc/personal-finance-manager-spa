import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useLocale } from '@/shared/i18n/useLocale'
import { useDocumentTitle } from '@/shared/lib/useDocumentTitle'
import { currencies, formatMoney, isZeroAmount, Money } from '@/shared/money'
import { Button } from '@/shared/ui/button'
import {
  accountsQuery,
  useArchiveAccount,
  useCreateAccount,
  useEditAccount,
  type Account,
  type InstitutionTotal,
} from '../api/accounts'
import { allInstitutionsQuery, type Institution } from '../api/institutions'
import { AccountForm } from '../components/AccountForm'
import { InstitutionLogo } from '../components/InstitutionLogo'

/** The accounts at one institution, or at none, with the API's total of them in each currency. */
type Group = { institution: Institution | null; accounts: Account[]; totals: InstitutionTotal[] }

/**
 * The accounts the user's money sits in, grouped by institution, each with its balance, and a total per
 * institution in each currency. Balances and totals come from the API; nothing is added up here.
 */
export function AccountsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  useDocumentTitle(t('screens.accounts'))
  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const accounts = useQuery(accountsQuery({ includeArchived: showArchived }))
  const institutions = useQuery(allInstitutionsQuery)
  const create = useCreateAccount()

  const groups = accounts.data && institutions.data ? groupByInstitution(accounts.data, institutions.data, locale) : undefined

  return (
    <section className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">{t('screens.accounts')}</h1>
          <Link className="text-sm underline" to="/accounts/institutions">
            {t('screens.institutions')}
          </Link>
        </div>
        <p className="text-muted-foreground">{t('accounts.intro')}</p>
      </div>

      {adding && institutions.data ? (
        <section aria-label={t('accounts.new')}>
          <AccountForm institutions={institutions.data} onSave={create.mutateAsync} onDone={() => setAdding(false)} />
        </section>
      ) : (
        <Button onClick={() => setAdding(true)}>{t('accounts.add')}</Button>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
        {t('accounts.showArchived')}
      </label>

      {(create.isError || accounts.isError || institutions.isError) && <ErrorMessage />}
      {groups?.length === 0 && !adding && <p className="text-muted-foreground">{t('accounts.empty')}</p>}
      {groups?.map((group) => (
        <InstitutionGroup key={group.institution?.id ?? 'none'} group={group} institutions={institutions.data ?? []} />
      ))}
    </section>
  )
}

/** Institutions by name, then the accounts held with none. Accounts keep the API's order, by name. */
function groupByInstitution(
  { accounts, totals }: { accounts: Account[]; totals: InstitutionTotal[] },
  institutions: Institution[],
  locale: string,
): Group[] {
  const collator = new Intl.Collator(locale)
  const groupFor = (institution: Institution | null): Group => {
    const id = institution?.id ?? null
    return {
      institution,
      accounts: accounts.filter((account) => account.institutionId === id),
      totals: totals
        .filter((total) => total.institutionId === id)
        .toSorted((a, b) => currencies.indexOf(a.currency) - currencies.indexOf(b.currency)),
    }
  }
  return [...institutions.toSorted((a, b) => collator.compare(a.name, b.name)), null].map(groupFor).filter((group) => group.accounts.length > 0)
}

function InstitutionGroup({ group, institutions }: { group: Group; institutions: Institution[] }) {
  const { t } = useTranslation()
  const headingId = useId()
  const name = group.institution?.name ?? t('accounts.noInstitution')

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {group.institution && <InstitutionLogo logoKey={group.institution.logoKey} color={group.institution.color} />}
        <h2 id={headingId} className="min-w-24 flex-1 text-lg font-semibold break-words">
          {name}
        </h2>
        <ul aria-label={t('accounts.totalsOf', { name })} className="text-right text-sm">
          {group.totals.map((total) => (
            <li key={total.currency}>
              <span className="text-muted-foreground">{t('accounts.total')}</span>{' '}
              <Money className="font-medium" amount={total.balance} currency={total.currency} />
            </li>
          ))}
        </ul>
      </div>
      <ul aria-label={t('accounts.accountsOf', { name })} className="divide-y rounded-lg border">
        {group.accounts.map((account) => (
          <AccountRow key={account.id} account={account} institutions={institutions} />
        ))}
      </ul>
    </section>
  )
}

function AccountRow({ account, institutions }: { account: Account; institutions: Institution[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const edit = useEditAccount(account)
  const archive = useArchiveAccount()
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmArchive'>('view')
  const toView = () => setMode('view')
  const toEdit = () => setMode('edit')
  const toConfirmArchive = () => setMode('confirmArchive')
  const stale = edit.data !== undefined && !edit.data.saved && 'stale' in edit.data

  if (mode === 'edit') {
    return (
      <li className="space-y-2 p-3">
        <h3 className="sr-only">{account.name}</h3>
        {stale && (
          <p role="alert" className="text-sm text-destructive">
            {t('accounts.errors.stale')}
          </p>
        )}
        {/* A new row version is a new account to edit: the form starts again from what the API holds now. */}
        <AccountForm key={account.rowVersion} account={account} institutions={institutions} onSave={edit.mutateAsync} onDone={toView} />
        {edit.isError && <ErrorMessage />}
      </li>
    )
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-24 flex-1">
          <h3 className="font-medium break-words">{account.name}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`accounts.types.${account.type}`)}
            {account.isArchived && (
              <>
                {' · '}
                <span>{t('accounts.archived')}</span>
              </>
            )}
          </p>
        </div>
        <span data-testid="balance" className="font-medium tabular-nums">
          <Money amount={account.balance} currency={account.currency} />
        </span>
        {mode === 'view' && (
          <>
            <Button variant="outline" size="sm" aria-label={t('accounts.editNamed', { name: account.name })} onClick={toEdit}>
              {t('accounts.edit')}
            </Button>
            {!account.isArchived && (
              <Button variant="ghost" size="sm" aria-label={t('accounts.archiveNamed', { name: account.name })} onClick={toConfirmArchive}>
                {t('accounts.archive')}
              </Button>
            )}
          </>
        )}
      </div>
      {mode === 'confirmArchive' && (
        <div role="group" aria-label={t('accounts.archiveNamed', { name: account.name })} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm">{t('accounts.archiveExplained', { name: account.name })}</p>
          {!isZeroAmount(account.balance) && (
            <p className="text-sm font-medium">
              {t('accounts.archiveNotZero', { balance: formatMoney(account.balance, account.currency, locale) })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={archive.isPending} onClick={() => archive.mutate(account.id)}>
              {t('accounts.archiveConfirm')}
            </Button>
            <Button variant="outline" size="sm" onClick={toView}>
              {t('accounts.cancel')}
            </Button>
          </div>
          {archive.isError && <ErrorMessage />}
        </div>
      )}
    </li>
  )
}

function ErrorMessage() {
  const { t } = useTranslation()
  return (
    <p role="alert" className="text-sm text-destructive">
      {t('accounts.errors.generic')}
    </p>
  )
}
