import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeImportsApi } from '@/test/fakeImportsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const firstBatch = '01970000-0000-7000-8000-600000000000'
const secondBatch = '01970000-0000-7000-8000-600000000001'

/** A Techcombank-like statement: a preamble, a header, one signed amount with dot thousands and comma decimals, and a total. */
const statement = [
  'TECHCOMBANK - SAO KE TAI KHOAN',
  '',
  'Ngày;Mô tả;Số tiền',
  '02-11-2026;HIGHLANDS COFFEE;-55.000,00',
  '05-11-2026;LUONG THANG 11;28.500.000,00',
  'Tổng;;',
  '06-11-2026;GRABFOOD HCM;-146.000,00',
  '',
].join('\n')

function fakeApis({ batches = [] as { accountId: string; text: string }[], transactions = [] as Parameters<typeof fakeTransactionsApi>[0] } = {}) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(transactions, { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  return {
    ...fakeImportsApi({ accounts: accountsApi.accounts, categories: categoriesApi.categories, transactions: transactionsApi.transactions, batches }),
    accounts: accountsApi.accounts,
    transactions: transactionsApi.transactions,
  }
}

/** Maps `statement`, chooses both categories and imports the 3 transactions ticked. */
async function commitStatement(user: User) {
  await mapStatement(user)
  await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })
  await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
  await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
  await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))
}

type User = ReturnType<typeof renderApp>['user']

/** Maps the date, description and amount of `statement`, written with a decimal comma. */
async function mapStatement(user: User) {
  await screen.findByRole('table', { name: 'The statement as uploaded' })
  await user.selectOptions(screen.getByLabelText('Date column'), 'Ngày')
  await user.selectOptions(screen.getByLabelText('Description column'), 'Mô tả')
  await user.selectOptions(screen.getByLabelText('Amount column'), 'Số tiền')
  await user.selectOptions(screen.getByLabelText('Decimal separator'), 'comma')
}

const previewRows = async () => within(await screen.findByRole('table', { name: 'Rows of the statement' }))

describe('importing a statement', () => {
  it('uploads a CSV file for an account and shows its rows, cut as it guessed the file is laid out', async () => {
    const importsApi = fakeApis()
    const { user, router } = renderApp('/import')

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([statement], 'tcb-november.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/import/${firstBatch}`))
    expect(importsApi.batches.map((batch) => [batch.accountId, batch.fileName])).toEqual([[everyday, 'tcb-november.csv']])
    expect(await screen.findByLabelText('Separator')).toHaveValue('semicolon')
    expect(screen.getByLabelText('Rows to skip at the start')).toHaveValue(2)
    expect(screen.getByLabelText('The next row names the columns')).toBeChecked()
    const raw = within(await screen.findByRole('table', { name: 'The statement as uploaded' }))
    expect(raw.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Row', 'Ngày', 'Mô tả', 'Số tiền'])
    expect(raw.getByText('HIGHLANDS COFFEE')).toBeInTheDocument()
  })

  it('refuses a file that is not a CSV saved as text (a spreadsheet named .csv), saying so', async () => {
    fakeApis()
    const { user } = renderApp('/import')

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])], 'statement.csv'))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    expect(await screen.findByText('This file cannot be read as a statement. Save it as CSV (UTF-8), with at most 10,000 rows, and upload it again.')).toBeInTheDocument()
  })

  it('refuses a statement of more than 10,000 rows, saying how many it may have', async () => {
    fakeApis()
    const { user } = renderApp('/import')
    expect(await screen.findByText('A CSV file of at most 5 MB and 10,000 rows, as your bank exports it.')).toBeInTheDocument()

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    const rows = Array.from({ length: 10_001 }, (_, row) => `02-11-2026;ROW ${row};-1.000,00`).join('\n')
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([rows], 'statement.csv'))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    expect(await screen.findByText(/with at most 10,000 rows/)).toBeInTheDocument()
  })

  it('previews the transactions once the date and amount columns are mapped, with the rows that cannot be read and why', async () => {
    fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    const { user } = renderApp(`/import/${firstBatch}`)

    await mapStatement(user)

    const rows = await previewRows()
    await waitFor(() => expect(rows.getByRole('row', { name: /HIGHLANDS COFFEE/ })).toHaveTextContent('-₫55,000'))
    expect(rows.getByRole('row', { name: /LUONG THANG 11/ })).toHaveTextContent('₫28,500,000')
    expect(rows.getByRole('row', { name: /Tổng/ })).toHaveTextContent('The date cannot be read.')
    expect(rows.queryByRole('checkbox', { name: 'Import row 6' })).not.toBeInTheDocument()
    expect(screen.getByText('3 rows to import')).toBeInTheDocument()
    expect(screen.getByText('1 row cannot be read and will not be imported')).toBeInTheDocument()
  })

  it('reads separate debit and credit columns, and the date format the user chooses', async () => {
    const text = ['Date,Debit,Credit,Details', '11/02/2026,"55,000",,COFFEE', '11/05/2026,,"28,500,000",SALARY', ''].join('\n')
    fakeApis({ batches: [{ accountId: everyday, text }] })
    const { user } = renderApp(`/import/${firstBatch}`)

    await screen.findByRole('table', { name: 'The statement as uploaded' })
    await user.selectOptions(screen.getByLabelText('Date column'), 'Date')
    await user.click(screen.getByRole('radio', { name: 'Debit and credit columns' }))
    await user.selectOptions(screen.getByLabelText('Debit column (money out)'), 'Debit')
    await user.selectOptions(screen.getByLabelText('Credit column (money in)'), 'Credit')
    await user.selectOptions(screen.getByLabelText('Description column'), 'Details')
    await user.selectOptions(screen.getByLabelText('Date format'), 'monthDayYear')

    const rows = await previewRows()
    await waitFor(() => expect(rows.getByRole('row', { name: /COFFEE/ })).toHaveTextContent('Nov 2, 2026'))
    expect(rows.getByRole('row', { name: /COFFEE/ })).toHaveTextContent('-₫55,000')
    expect(rows.getByRole('row', { name: /SALARY/ })).toHaveTextContent('₫28,500,000')
  })

  it('marks a likely duplicate, unticked, says how many will be skipped, and imports it once ticked', async () => {
    const importsApi = fakeApis({
      batches: [{ accountId: everyday, text: statement }],
      transactions: [{ type: 'expense', accountId: everyday, amount: '55000.00', date: '2026-11-02', categoryId: 'c-food', payee: 'Highlands Coffee' }],
    })
    const { user } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)

    const rows = await previewRows()
    const duplicate = await rows.findByRole('checkbox', { name: 'Import row 4' })
    await waitFor(() => expect(rows.getByRole('row', { name: /HIGHLANDS COFFEE/ })).toHaveTextContent('Likely duplicate'))
    expect(duplicate).not.toBeChecked()
    expect(rows.getByRole('checkbox', { name: 'Import row 5' })).toBeChecked()
    expect(screen.getByText('1 likely duplicate will be skipped')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 2 transactions' })).toBeInTheDocument()

    await user.click(duplicate)

    expect(screen.queryByText('1 likely duplicate will be skipped')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))
    await waitFor(() => expect(importsApi.commitRequests.map((request) => request.rows)).toEqual([[4, 5, 7]]))
  })

  it('asks for a category for each way money moves among the rows chosen before committing', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    const { user } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)
    await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })

    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))

    expect(await screen.findByText('Choose the category money going out is recorded on.')).toBeInTheDocument()
    expect(screen.getByText('Choose the category money coming in is recorded on.')).toBeInTheDocument()
    expect(importsApi.commitRequests).toEqual([])
  })

  it('commits the rows ticked with the mapping and categories, and shows the import’s progress until it is done', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    const { user } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)
    await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')

    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))

    await waitFor(() =>
      expect(importsApi.commitRequests).toEqual([
        {
          mapping: {
            separator: 'semicolon', skipFirstRows: 2, hasHeaderRow: true, skipLastRows: 0, dateColumn: 0, descriptionColumn: 1, amountColumn: 2,
            debitColumn: null, creditColumn: null, dateFormat: 'dayMonthYear', decimalSeparator: 'comma',
          },
          rows: [4, 5, 7],
          expenseCategoryId: 'c-food',
          incomeCategoryId: 'c-salary',
        },
      ]),
    )
    const progress = await screen.findByRole('progressbar', { name: 'Importing transactions' })
    expect(progress).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('0 of 3 transactions imported')).toBeInTheDocument()

    importsApi.importNext(firstBatch, 2)
    expect(await screen.findByText('2 of 3 transactions imported', undefined, { timeout: 3000 })).toBeInTheDocument()

    importsApi.importNext(firstBatch)
    expect(await screen.findByText('3 transactions imported.', undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See them in the transactions' })).toHaveAttribute('href', `/transactions?accountId=${everyday}`)
  })

  it('says why an import stopped, keeping what it imported, and starts again with the same account and mapping', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    const { user, router } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)
    await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))
    await screen.findByRole('progressbar', { name: 'Importing transactions' })

    importsApi.importNext(firstBatch, 1)
    importsApi.fail(firstBatch, 'categoryArchived')

    expect(await screen.findByText('The import stopped after 1 of 3 transactions. Those stay.', undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('A category chosen for the statement was archived after you imported it.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Start again' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/import'))
    await screen.findByRole('option', { name: 'Everyday (VND)' })
    expect(screen.getByLabelText('Account')).toHaveValue(everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([statement], 'tcb-november.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/import/${secondBatch}`))
    expect(await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })).toBeChecked()
    expect(screen.getByLabelText('Decimal separator')).toHaveValue('comma')
  })

  it('shows a long statement a page at a time, keeping what is ticked and unticked from page to page', async () => {
    const lines = Array.from({ length: 250 }, (_, index) => `01-11-2026;SHOP ${index + 2};-1.000,00`)
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: ['Ngày;Mô tả;Số tiền', ...lines, ''].join('\n') }] })
    const { user } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)

    const rows = await previewRows()
    expect(await rows.findByRole('checkbox', { name: 'Import row 100' })).toBeChecked()
    expect(rows.queryByRole('checkbox', { name: 'Import row 101' })).not.toBeInTheDocument()
    expect(screen.getByText('Rows 1–100 of 251')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous rows' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next rows' }))
    await user.click(rows.getByRole('checkbox', { name: 'Import row 150' }))
    await user.click(screen.getByRole('button', { name: 'Next rows' }))
    expect(screen.getByText('Rows 201–251 of 251')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next rows' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous rows' }))

    expect(rows.getByRole('checkbox', { name: 'Import row 150' })).not.toBeChecked()
    expect(rows.getByRole('checkbox', { name: 'Import row 151' })).toBeChecked()
    expect(rows.getAllByRole('row')).toHaveLength(101)
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.click(screen.getByRole('button', { name: 'Import 249 transactions' }))
    await waitFor(() => expect(importsApi.commitRequests[0]?.rows).toHaveLength(249))
    expect(importsApi.commitRequests[0]?.rows).not.toContain(150)
  })

  it('says another statement is being imported into the account, and imports nothing until it is done', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }, { accountId: everyday, text: statement }] })
    Object.assign(importsApi.batches[0]!, { status: 'committing' })
    const { user } = renderApp(`/import/${secondBatch}`)

    await commitStatement(user)

    expect(
      await screen.findByText('Another statement is being imported into this account. Wait for it to finish, then check the rows again: those it imported will show as likely duplicates.'),
    ).toBeInTheDocument()
    expect(importsApi.batches[1]!.status).toBe('uploaded')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('previews the statement again once a commit is refused while another is importing, unticking the rows that one brought in', async () => {
    const importsApi = fakeApis({
      batches: [{ accountId: everyday, text: statement }, { accountId: everyday, text: statement }],
      transactions: [{ type: 'expense', accountId: everyday, amount: '55000.00', date: '2026-10-02', categoryId: 'c-food', payee: 'Highlands Coffee' }],
    })
    Object.assign(importsApi.batches[0]!, { status: 'committing' })
    const { user } = renderApp(`/import/${secondBatch}`)
    await mapStatement(user)
    const rows = await previewRows()
    expect(await rows.findByRole('checkbox', { name: 'Import row 4' })).toBeChecked()

    // The other statement imports a row this one has too.
    Object.assign(importsApi.transactions[0]!, { date: '2026-11-02' })
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))

    await waitFor(() => expect(rows.getByRole('checkbox', { name: 'Import row 4' })).not.toBeChecked())
    expect(screen.getByText('1 likely duplicate will be skipped')).toBeInTheDocument()
    expect(screen.getByText(/Another statement is being imported into this account/)).toBeInTheDocument()
  })

  it('does not import while the preview of a changed mapping is still loading', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    const { user } = renderApp(`/import/${firstBatch}`)
    await mapStatement(user)
    await (await previewRows()).findByRole('checkbox', { name: 'Import row 4' })
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
    importsApi.holdPreviews()

    await user.selectOptions(screen.getByLabelText('Description column'), 'Ngày')

    expect(screen.getByRole('button', { name: 'Import 3 transactions' })).toBeDisabled()
    importsApi.releasePreviews()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import 3 transactions' })).toBeEnabled())
  })

  it('says the account was archived since the statement was uploaded when the commit is refused for it', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    Object.assign(importsApi.accounts[0]!, { isArchived: true })
    const { user } = renderApp(`/import/${firstBatch}`)

    await commitStatement(user)

    expect(await screen.findByText('The account has been archived since the statement was uploaded.')).toBeInTheDocument()
  })

  it('says each reason an import can stop in words of its own', async () => {
    const importsApi = fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    importsApi.fail(firstBatch, 'unexpected')
    renderApp(`/import/${firstBatch}`)

    expect(await screen.findByText('Something went wrong while importing it. Start again, and if it happens again, tell us.')).toBeInTheDocument()
  })
})
