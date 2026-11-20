import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeProfileApi } from '@/test/fakeProfileApi'
import { renderApp } from '@/test/renderApp'

const vietcombank = '01970000-0000-7000-8000-100000000000'
const wise = '01970000-0000-7000-8000-100000000001'

type Accounts = Parameters<typeof fakeAccountsApi>[0]
type Options = Parameters<typeof fakeAccountsApi>[1]

function fakeApis(accounts: Accounts, options: Options = {}) {
  fakeInstitutionsApi([{ name: 'Vietcombank' }, { name: 'Wise' }])
  return fakeAccountsApi(accounts, options)
}

const mixed: Accounts = [
  { name: 'Everyday', institutionId: vietcombank, openingBalance: '1000000.00' },
  { name: 'Dollars', institutionId: vietcombank, currency: 'USD', openingBalance: '50.25' },
  { name: 'Euros', institutionId: wise, currency: 'EUR', openingBalance: '10.00' },
  { name: 'Pocket', type: 'cash', openingBalance: '5000.00' },
]

/** What the screen says all the accounts come to in the base currency, with any flag under it. */
const totalOfAll = () => screen.getByRole('group', { name: 'All accounts' })
/** What it says the accounts of one institution come to in the base currency; null when it does not say. */
const baseCurrencyTotalOf = (institution: string, currency = 'VND') =>
  within(screen.getByRole('region', { name: institution })).queryByRole('group', { name: `Total of ${institution} in ${currency}` })

describe('totals in the base currency', () => {
  it('are shown for all accounts and for each institution that holds another currency, next to each balance in its own', async () => {
    fakeApis(mixed, { rates: { VND: { USD: 25000, EUR: 31250 } } })
    renderApp('/accounts')

    await screen.findByRole('region', { name: 'Vietcombank' })
    expect(totalOfAll()).toHaveTextContent('Total in VND ₫2,573,750')
    expect(baseCurrencyTotalOf('Vietcombank')).toHaveTextContent('In VND ₫2,256,250')
    expect(baseCurrencyTotalOf('Wise')).toHaveTextContent('In VND ₫312,500')
    expect(within(screen.getByRole('list', { name: 'Totals of Vietcombank' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Total ₫1,000,000',
      'Total $50.25',
    ])
    expect(screen.queryByText(/Not converted/)).not.toBeInTheDocument()
  })

  it('are not repeated for an institution whose one total is already in the base currency', async () => {
    fakeApis(mixed, { rates: { VND: { USD: 25000, EUR: 31250 } } })
    renderApp('/accounts')

    await screen.findByRole('region', { name: 'No institution' })
    expect(baseCurrencyTotalOf('No institution')).not.toBeInTheDocument()
  })

  it('leave out an amount with no exchange rate, and flag it as not converted on its institution and on the total', async () => {
    fakeApis(mixed, { rates: { VND: { USD: 25000 } } })
    renderApp('/accounts')

    await screen.findByRole('region', { name: 'Wise' })
    expect(totalOfAll()).toHaveTextContent('Total in VND ₫2,261,250')
    expect(within(totalOfAll()).getByRole('note')).toHaveTextContent(
      'Not converted: €10.00. No exchange rate is available yet, so it is left out of the total.',
    )
    expect(baseCurrencyTotalOf('Wise')).toHaveTextContent('In VND ₫0')
    expect(within(baseCurrencyTotalOf('Wise')!).getByRole('note')).toHaveTextContent('Not converted: €10.00.')
    expect(within(baseCurrencyTotalOf('Vietcombank')!).queryByRole('note')).not.toBeInTheDocument()
  })

  it('name every amount that is not converted when there are several', async () => {
    fakeApis(mixed)
    renderApp('/accounts')

    await screen.findByRole('region', { name: 'Wise' })
    expect(totalOfAll()).toHaveTextContent('Total in VND ₫1,005,000')
    expect(within(totalOfAll()).getByRole('note')).toHaveTextContent('Not converted: $50.25 and €10.00.')
  })

  it('are not shown while there are no accounts', async () => {
    fakeApis([])
    renderApp('/accounts')

    await screen.findByText('No accounts yet. Add the accounts your money sits in.')
    expect(screen.queryByRole('group', { name: 'All accounts' })).not.toBeInTheDocument()
  })

  it('follow the base currency as soon as the user changes it in their profile', async () => {
    const profile = fakeProfileApi({ locale: 'en' })
    fakeApis(mixed, { baseCurrency: () => profile.profile.baseCurrency, rates: { VND: { USD: 25000, EUR: 31250 }, USD: { VND: 0.00004, EUR: 1.25 } } })
    const { user } = renderApp('/accounts')
    await screen.findByRole('region', { name: 'Vietcombank' })
    expect(totalOfAll()).toHaveTextContent('Total in VND ₫2,573,750')

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Base currency' }), 'USD')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('status')
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Accounts' }))

    await screen.findByRole('region', { name: 'Vietcombank' })
    // 1,005,000 VND is 40.20 USD; 10 EUR is 12.50 USD.
    expect(totalOfAll()).toHaveTextContent('Total in USD $102.95')
    expect(baseCurrencyTotalOf('Vietcombank', 'USD')).toHaveTextContent('In USD $90.25')
  })

  it('are shown in Vietnamese', async () => {
    fakeApis(mixed, { rates: { VND: { USD: 25000 } } })
    renderApp('/accounts', { language: 'vi' })

    await screen.findByRole('region', { name: 'Wise' })
    const total = screen.getByRole('group', { name: 'Tất cả tài khoản' })
    expect(total).toHaveTextContent('Tổng quy đổi sang VND 2.261.250 ₫')
    expect(within(total).getByRole('note')).toHaveTextContent('Chưa quy đổi: 10,00 €. Chưa có tỷ giá nên khoản này không được tính vào tổng.')
  })
})
