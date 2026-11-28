import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { components } from '@/shared/api/schema'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeImportsApi } from '@/test/fakeImportsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const firstBatch = '01970000-0000-7000-8000-600000000000'
const secondBatch = '01970000-0000-7000-8000-600000000001'

const statement = ['Ngày;Mô tả;Số tiền', '02-11-2026;HIGHLANDS COFFEE;-55.000,00', '05-11-2026;LUONG THANG 11;28.500.000,00', ''].join('\n')

/** How the user read `statement` last time: what the API saved for the account. */
const saved: components['schemas']['MappingResponse'] = {
  separator: 'semicolon',
  skipFirstRows: 0,
  hasHeaderRow: true,
  skipLastRows: 0,
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 2,
  debitColumn: null,
  creditColumn: null,
  dateFormat: 'dayMonthYear',
  decimalSeparator: 'comma',
}

type Past = NonNullable<Parameters<typeof fakeImportsApi>[0]['batches']>

function fakeApis({ batches = [] as Past, archived = [] as string[] } = {}) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday' }])
  const categoriesApi = fakeCategoriesApi({
    categories: defaultTestCategories.map((category) => (archived.includes(category.id) ? { ...category, isArchived: true } : category)),
  })
  const transactionsApi = fakeTransactionsApi([], { accounts: accountsApi.accounts, categories: categoriesApi.categories })
  return fakeImportsApi({ accounts: accountsApi.accounts, categories: categoriesApi.categories, transactions: transactionsApi.transactions, batches })
}

const october: Past[number] = {
  accountId: everyday,
  fileName: 'tcb-october.csv',
  text: statement,
  past: { status: 'committed', createdAt: '2026-11-02T03:00:00Z', rowCount: 5, selectedCount: 3, importedCount: 3, duplicateCount: 1, failedCount: 1 },
}

const september: Past[number] = {
  accountId: everyday,
  fileName: 'tcb-september.csv',
  text: statement,
  past: { status: 'committed', createdAt: '2026-10-01T03:00:00Z', rowCount: 2, selectedCount: 2, importedCount: 2 },
}

const pastImports = async () => within(await screen.findByRole('list', { name: 'Past imports' }))

describe('the mapping saved for an account', () => {
  it('reads the next statement uploaded for the account with the mapping saved when its last one was imported, which can still be changed', async () => {
    const importsApi = fakeApis()
    importsApi.savedMappings.set(everyday, saved)
    const { user, router } = renderApp('/import')

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([statement], 'tcb-november.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/import/${firstBatch}`))
    expect(await screen.findByText('Read with the mapping saved for this account when its last statement was imported. Change anything this one does differently.')).toBeInTheDocument()
    expect(screen.getByLabelText('Decimal separator')).toHaveValue('comma')
    const rows = within(await screen.findByRole('table', { name: 'Rows of the statement' }))
    expect(await rows.findByText('LUONG THANG 11')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 2 transactions' })).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Description column'), '')
    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.selectOptions(screen.getByLabelText('Category for money coming in'), 'c-salary')
    await user.click(await screen.findByRole('button', { name: 'Import 2 transactions' }))

    await waitFor(() => expect(importsApi.commitRequests).toHaveLength(1))
    expect(importsApi.commitRequests[0]!.mapping).toEqual({ ...saved, descriptionColumn: null })
  })

  it('starts from the categories the account’s last statement was imported with, so a repeat import needs no choices', async () => {
    const importsApi = fakeApis()
    importsApi.savedMappings.set(everyday, saved)
    importsApi.savedCategories.set(everyday, { expenseCategoryId: 'c-food', incomeCategoryId: 'c-salary' })
    const { user } = renderApp('/import')

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([statement], 'tcb-november.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(screen.getByLabelText('Category for money going out')).toHaveValue('c-food'))
    expect(screen.getByLabelText('Category for money coming in')).toHaveValue('c-salary')
    await user.click(await screen.findByRole('button', { name: 'Import 2 transactions' }))

    await waitFor(() => expect(importsApi.commitRequests).toHaveLength(1))
    expect(importsApi.commitRequests[0]).toMatchObject({ expenseCategoryId: 'c-food', incomeCategoryId: 'c-salary' })
  })

  it('leaves a saved category to choose again once it is archived', async () => {
    const importsApi = fakeApis({ archived: ['c-food'] })
    importsApi.savedMappings.set(everyday, saved)
    importsApi.savedCategories.set(everyday, { expenseCategoryId: 'c-food', incomeCategoryId: 'c-salary' })
    const { user } = renderApp('/import')

    await screen.findByRole('option', { name: 'Everyday (VND)' })
    await user.selectOptions(screen.getByLabelText('Account'), everyday)
    await user.upload(screen.getByLabelText('Statement file (CSV)'), new File([statement], 'tcb-november.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Upload' }))

    await waitFor(() => expect(screen.getByLabelText('Category for money coming in')).toHaveValue('c-salary'))
    expect(screen.getByLabelText('Category for money going out')).toHaveValue('')
  })

  it('starts from the guess at the layout for an account with no mapping saved, saying nothing of one', async () => {
    fakeApis({ batches: [{ accountId: everyday, text: statement }] })
    renderApp(`/import/${firstBatch}`)

    expect(await screen.findByLabelText('Separator')).toHaveValue('semicolon')
    await screen.findByRole('table', { name: 'The statement as uploaded' })
    expect(screen.queryByText(/mapping saved for this account/)).not.toBeInTheDocument()
  })
})

describe('past imports', () => {
  it('lists each statement imported, the last first, with its file name, account, date and counts', async () => {
    fakeApis({ batches: [september, october, { accountId: everyday, fileName: 'not-yet.csv', text: statement }] })
    renderApp('/import')

    const list = await pastImports()
    const items = await list.findAllByRole('listitem')
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual(['tcb-october.csv', 'tcb-september.csv'])
    expect(items[0]).toHaveTextContent('Everyday')
    expect(items[0]).toHaveTextContent('Nov 2, 2026')
    expect(items[0]).toHaveTextContent('Imported')
    expect(items[0]).toHaveTextContent('3 transactions imported')
    expect(items[0]).toHaveTextContent('1 likely duplicate skipped')
    expect(items[0]).toHaveTextContent('1 row could not be read')
    expect(within(items[0]!).getByRole('link', { name: 'tcb-october.csv' })).toHaveAttribute('href', `/import/${secondBatch}`)
  })

  it('says when nothing has been imported yet', async () => {
    fakeApis()
    renderApp('/import')

    expect(await screen.findByText('No statements imported yet.')).toBeInTheDocument()
  })

  it('undoes an import once confirmed, deleting its transactions, which can be restored for 30 days', async () => {
    const importsApi = fakeApis({ batches: [october] })
    const { user } = renderApp('/import')

    const list = await pastImports()
    await user.click(await list.findByRole('button', { name: 'Undo tcb-october.csv' }))
    expect(list.getByText('This deletes the 3 transactions this statement imported, edited or not. You can restore any of them from Recently deleted for 30 days.')).toBeInTheDocument()
    await user.click(list.getByRole('button', { name: 'Undo import' }))

    await waitFor(() => expect(list.getByRole('listitem')).toHaveTextContent('Undone'))
    expect(importsApi.batches[0]!.status).toBe('undone')
    expect(list.queryByRole('button', { name: 'Undo tcb-october.csv' })).not.toBeInTheDocument()
    expect(list.getByRole('link', { name: 'Recently deleted' })).toHaveAttribute('href', '/transactions/deleted')
  })

  it('says an import cannot be undone while any of its transactions is reconciled, and undoes nothing', async () => {
    const importsApi = fakeApis({ batches: [october] })
    importsApi.reconciled.set(firstBatch, 2)
    const { user } = renderApp('/import')

    const list = await pastImports()
    await user.click(await list.findByRole('button', { name: 'Undo tcb-october.csv' }))
    await user.click(list.getByRole('button', { name: 'Undo import' }))

    expect(await list.findByText('2 of its transactions are reconciled. Reopen the reconciliation, then undo the import.')).toBeInTheDocument()
    expect(importsApi.batches[0]!.status).toBe('committed')
  })

  it('offers to undo an import from its own screen once it is done, then says it was undone', async () => {
    fakeApis({ batches: [october] })
    const { user } = renderApp(`/import/${firstBatch}`)

    await user.click(await screen.findByRole('button', { name: 'Undo tcb-october.csv' }))
    await user.click(screen.getByRole('button', { name: 'Undo import' }))

    expect(await screen.findByText('This import was undone. Its transactions were deleted; you can restore any of them from Recently deleted for 30 days.')).toBeInTheDocument()
  })
})
