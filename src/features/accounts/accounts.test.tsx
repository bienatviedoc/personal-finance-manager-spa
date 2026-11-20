import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { renderApp } from '@/test/renderApp'

const vietcombank = '01970000-0000-7000-8000-100000000000'
const momo = '01970000-0000-7000-8000-100000000001'

function fakeApis(accounts: Parameters<typeof fakeAccountsApi>[0] = [], institutions: Parameters<typeof fakeInstitutionsApi>[0] = [{ name: 'Vietcombank' }, { name: 'MoMo' }]) {
  const institutionsApi = fakeInstitutionsApi(institutions)
  const accountsApi = fakeAccountsApi(accounts, { institutions: institutionsApi.institutions })
  return { accountsApi, institutionsApi }
}

/** The names of the accounts listed under an institution, with the balance each shows. */
function listedUnder(institution: string) {
  const list = within(screen.getByRole('region', { name: institution })).getByRole('list', { name: `Accounts of ${institution}` })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => [within(item).getByRole('heading').textContent, within(item).getByTestId('balance').textContent])
}

function totalsOf(institution: string) {
  const list = within(screen.getByRole('region', { name: institution })).getByRole('list', { name: `Totals of ${institution}` })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent)
}

describe('accounts', () => {
  it('are listed grouped by institution, with a total per institution in each currency', async () => {
    fakeApis([
      { name: 'Everyday', institutionId: vietcombank, openingBalance: '1000000.00' },
      { name: 'Visa', type: 'creditCard', institutionId: vietcombank, openingBalance: '-200000.00', amountOwed: '200000.00' },
      { name: 'Dollars', type: 'savings', institutionId: vietcombank, currency: 'USD', openingBalance: '50.25' },
      { name: 'Wallet', type: 'eWallet', institutionId: momo, openingBalance: '70000.00' },
      { name: 'Pocket', type: 'cash', openingBalance: '5000.00' },
      { name: 'Closed', institutionId: momo, openingBalance: '999.00', isArchived: true },
    ])
    renderApp('/accounts')

    expect(await screen.findByRole('region', { name: 'Vietcombank' })).toBeInTheDocument()
    expect(screen.getAllByRole('region').map((region) => within(region).getByRole('heading', { level: 2 }).textContent)).toEqual([
      'MoMo',
      'Vietcombank',
      'No institution',
    ])
    expect(listedUnder('Vietcombank')).toEqual([
      ['Dollars', '$50.25'],
      ['Everyday', '₫1,000,000'],
      ['Visa', '-₫200,000'],
    ])
    expect(totalsOf('Vietcombank')).toEqual(['Total ₫800,000', 'Total $50.25'])
    expect(listedUnder('MoMo')).toEqual([['Wallet', '₫70,000']])
    expect(totalsOf('MoMo')).toEqual(['Total ₫70,000'])
    expect(listedUnder('No institution')).toEqual([['Pocket', '₫5,000']])
    expect(within(screen.getByRole('region', { name: 'Vietcombank' })).getByText('Credit card')).toBeInTheDocument()
  })

  it('are all listed, however many pages the API answers in', async () => {
    fakeApis(Array.from({ length: 51 }, (_, index) => ({ name: `Account ${String(index + 1).padStart(2, '0')}`, openingBalance: '1.00' })))
    renderApp('/accounts')

    await screen.findByRole('region', { name: 'No institution' })
    expect(listedUnder('No institution')).toHaveLength(51)
    expect(totalsOf('No institution')).toEqual(['Total ₫51'])
  })

  it('say so when there are none yet', async () => {
    fakeApis()
    renderApp('/accounts')

    expect(await screen.findByText('No accounts yet. Add the accounts your money sits in.')).toBeInTheDocument()
  })

  it('can be added with a name, type, institution, currency, opening balance and opening date', async () => {
    const { accountsApi } = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Add account' }))
    await user.type(screen.getByLabelText('Name'), 'Dollars')
    await user.selectOptions(screen.getByLabelText('Type'), 'Savings')
    await user.selectOptions(screen.getByLabelText('Institution'), 'Vietcombank')
    await user.selectOptions(screen.getByLabelText('Currency'), 'USD')
    await user.type(screen.getByLabelText('Opening balance'), '1,250.5')
    await user.clear(screen.getByLabelText('Opening date'))
    await user.type(screen.getByLabelText('Opening date'), '2026-10-15')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('region', { name: 'Vietcombank' })
    expect(listedUnder('Vietcombank')).toEqual([['Dollars', '$1,250.50']])
    expect(totalsOf('Vietcombank')).toEqual(['Total $1,250.50'])
    expect(accountsApi.accounts).toEqual([
      expect.objectContaining({
        name: 'Dollars',
        type: 'savings',
        institutionId: vietcombank,
        currency: 'USD',
        openingBalance: '1250.50',
        amountOwed: null,
        openingDate: '2026-10-15',
      }),
    ])
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('start in the base currency, opening today in the user’s time zone, with no institution', async () => {
    fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Add account' }))

    expect(screen.getByLabelText('Currency')).toHaveValue('VND')
    expect(screen.getByLabelText('Institution')).toHaveDisplayValue('No institution')
    expect(screen.getByLabelText('Opening date')).toHaveValue(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    )
  })

  it.each(['Credit card', 'Loan'])('ask a %s for the amount owed as a positive number, and show it as a negative balance', async (type) => {
    const { accountsApi } = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Add account' }))
    await user.type(screen.getByLabelText('Name'), 'What I owe')
    expect(screen.getByLabelText('Opening balance')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Type'), type)

    expect(screen.queryByLabelText('Opening balance')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount owed')).toHaveAccessibleDescription(
      'Enter what you owe as a positive number. The account shows it as a negative balance.',
    )
    await user.type(screen.getByLabelText('Amount owed'), '200,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('region', { name: 'No institution' })
    expect(listedUnder('No institution')).toEqual([['What I owe', '-₫200,000']])
    expect(accountsApi.accounts).toEqual([expect.objectContaining({ amountOwed: '200000.00', openingBalance: '-200000.00' })])
  })

  it('show the new balance as soon as the opening balance is changed, naming the row version the edit was made from', async () => {
    const { accountsApi } = fakeApis([{ name: 'Everyday', institutionId: vietcombank, openingBalance: '1000000.00', rowVersion: '7' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Edit Everyday' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Everyday')
    expect(screen.getByLabelText('Institution')).toHaveDisplayValue('Vietcombank')
    expect(screen.getByLabelText('Opening balance')).toHaveValue('1,000,000')
    expect(screen.getByLabelText('Opening date')).toHaveValue('2026-11-01')
    await user.clear(screen.getByLabelText('Opening balance'))
    await user.type(screen.getByLabelText('Opening balance'), '2,500,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(listedUnder('Vietcombank')).toEqual([['Everyday', '₫2,500,000']]))
    expect(totalsOf('Vietcombank')).toEqual(['Total ₫2,500,000'])
    expect(accountsApi.ifMatches).toEqual(['"7"'])
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('edit a credit card by its amount owed', async () => {
    const { accountsApi } = fakeApis([{ name: 'Visa', type: 'creditCard', openingBalance: '-200000.00', amountOwed: '200000.00' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Edit Visa' }))
    expect(screen.getByLabelText('Amount owed')).toHaveValue('200,000')
    await user.clear(screen.getByLabelText('Amount owed'))
    await user.type(screen.getByLabelText('Amount owed'), '50,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(listedUnder('No institution')).toEqual([['Visa', '-₫50,000']]))
    expect(accountsApi.accounts[0]).toEqual(expect.objectContaining({ amountOwed: '50000.00', openingBalance: '-50000.00' }))
  })

  it('are not saved over a change made somewhere else: the latest version is shown instead', async () => {
    const { accountsApi } = fakeApis([{ name: 'Everyday', openingBalance: '1000.00' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Edit Everyday' }))
    // Another device renames the account while this form is open.
    Object.assign(accountsApi.accounts[0]!, { name: 'Renamed elsewhere', rowVersion: '2' })
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'My name for it')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('This account was changed somewhere else since you opened it. The latest version is shown; check it and save again.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Renamed elsewhere'))
    expect(accountsApi.accounts[0]?.name).toBe('Renamed elsewhere')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(accountsApi.ifMatches).toEqual(['"1"', '"2"']))
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument())
  })

  it('need a name and an amount, which are checked before contacting the API', async () => {
    const { accountsApi } = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Add account' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByText('Enter an amount.')).toBeInTheDocument()
    expect(screen.getByLabelText('Opening balance')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Opening balance'), '12.5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter an amount, such as 1,250,000.')).toBeInTheDocument()
    expect(accountsApi.accounts).toEqual([])
  })

  it('show a problem only the API could find next to the field it concerns', async () => {
    const { accountsApi, institutionsApi } = fakeApis()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Add account' }))
    await user.type(screen.getByLabelText('Name'), 'Everyday')
    await user.selectOptions(screen.getByLabelText('Institution'), 'MoMo')
    await user.type(screen.getByLabelText('Opening balance'), '0')
    // The institution is archived somewhere else after the picker offered it.
    institutionsApi.institutions.find((institution) => institution.name === 'MoMo')!.isArchived = true
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose one of your institutions that is not archived.')).toBeInTheDocument()
    expect(screen.getByLabelText('Institution')).toHaveAttribute('aria-invalid', 'true')
    expect(accountsApi.accounts).toEqual([])
  })

  it('offer only institutions that are not archived, and keep the archived one an account is already with', async () => {
    fakeApis(
      [{ name: 'Old savings', institutionId: '01970000-0000-7000-8000-100000000002' }],
      [{ name: 'Vietcombank' }, { name: 'MoMo' }, { name: 'Old bank', isArchived: true }],
    )
    const { user } = renderApp('/accounts')

    expect(await screen.findByRole('region', { name: 'Old bank' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add account' }))
    expect(within(screen.getByLabelText('Institution')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No institution',
      'MoMo',
      'Vietcombank',
    ])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Edit Old savings' }))
    expect(screen.getByLabelText('Institution')).toHaveDisplayValue('Old bank')
  })

  it('leave the list when archived at a zero balance, after the user confirms', async () => {
    const { accountsApi } = fakeApis([{ name: 'Everyday', openingBalance: '1000.00' }, { name: 'Empty', openingBalance: '0.00' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Archive Empty' }))
    const confirmation = screen.getByRole('group', { name: 'Archive Empty' })
    expect(within(confirmation).getByText('Archive Empty? It leaves pickers and lists, and stays in your history.')).toBeInTheDocument()
    expect(within(confirmation).queryByText(/not zero/)).not.toBeInTheDocument()
    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(listedUnder('No institution')).toEqual([['Everyday', '₫1,000']]))
    expect(accountsApi.accounts.find((account) => account.name === 'Empty')?.isArchived).toBe(true)
  })

  it('can be archived at any balance, with a warning when it is not zero', async () => {
    const { accountsApi } = fakeApis([{ name: 'Visa', type: 'creditCard', openingBalance: '-200000.00', amountOwed: '200000.00' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Archive Visa' }))
    const confirmation = screen.getByRole('group', { name: 'Archive Visa' })
    expect(within(confirmation).getByText('Its balance is not zero: -₫200,000 stays in your totals and reports.')).toBeInTheDocument()
    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    expect(await screen.findByText('No accounts yet. Add the accounts your money sits in.')).toBeInTheDocument()
    expect(accountsApi.accounts[0]?.isArchived).toBe(true)
  })

  it('stay as they are when the user cancels archiving', async () => {
    const { accountsApi } = fakeApis([{ name: 'Everyday' }])
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('button', { name: 'Archive Everyday' }))
    await user.click(within(screen.getByRole('group', { name: 'Archive Everyday' })).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('group', { name: 'Archive Everyday' })).not.toBeInTheDocument()
    expect(accountsApi.accounts[0]?.isArchived).toBe(false)
  })

  it('remain in history once archived: shown, marked as archived, when asked for', async () => {
    fakeApis([
      { name: 'Everyday', openingBalance: '1000.00' },
      { name: 'Closed', openingBalance: '250.00', isArchived: true },
    ])
    const { user } = renderApp('/accounts')

    await screen.findByRole('region', { name: 'No institution' })
    expect(listedUnder('No institution')).toEqual([['Everyday', '₫1,000']])
    await user.click(screen.getByRole('checkbox', { name: 'Show archived accounts' }))

    await waitFor(() =>
      expect(listedUnder('No institution')).toEqual([
        ['Closed', '₫250'],
        ['Everyday', '₫1,000'],
      ]),
    )
    const closed = within(screen.getByRole('list', { name: 'Accounts of No institution' })).getAllByRole('listitem')[0]!
    expect(within(closed).getByText('Archived')).toBeInTheDocument()
    expect(within(closed).queryByRole('button', { name: 'Archive Closed' })).not.toBeInTheDocument()
    expect(totalsOf('No institution')).toEqual(['Total ₫1,250'])
  })

  it('are shown in Vietnamese, with amounts written the Vietnamese way', async () => {
    fakeApis([{ name: 'Visa', type: 'creditCard', institutionId: vietcombank, openingBalance: '-200000.00', amountOwed: '200000.00' }])
    renderApp('/accounts', { language: 'vi' })

    const region = await screen.findByRole('region', { name: 'Vietcombank' })
    expect(within(region).getByText('Thẻ tín dụng')).toBeInTheDocument()
    expect(within(region).getByTestId('balance').textContent).toBe('-200.000 ₫')
  })
})
