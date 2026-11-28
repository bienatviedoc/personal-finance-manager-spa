import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import type { FakeRule } from '@/test/fakeCategorisationRulesApi'
import { fakeImportsApi } from '@/test/fakeImportsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { renderApp } from '@/test/renderApp'

const everyday = '01970000-0000-7000-8000-200000000000'
const firstBatch = '01970000-0000-7000-8000-600000000000'

/** Two expenses and a salary, with a header and no preamble. */
const statement = ['Ngày;Mô tả;Số tiền', '02-11-2026;HIGHLANDS COFFEE;-55.000,00', '05-11-2026;LUONG THANG 11;28.500.000,00', '06-11-2026;GRABFOOD HCM;-146.000,00', ''].join('\n')

const rules: FakeRule[] = [
  { id: 'r-grab', matchText: 'grab', matchType: 'contains', categoryId: 'c-transport', priority: 1, rowVersion: '1' },
  { id: 'r-luong', matchText: 'luong', matchType: 'startsWith', categoryId: 'c-salary', priority: 0, rowVersion: '1' },
  // An expense rule never categorises income.
  { id: 'r-thang', matchText: 'thang', matchType: 'contains', categoryId: 'c-groceries', priority: 9, rowVersion: '1' },
]

function fakeApis() {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  return fakeImportsApi({ accounts: accountsApi.accounts, categories: categoriesApi.categories, batches: [{ accountId: everyday, text: statement }], rules })
}

type User = ReturnType<typeof renderApp>['user']

/** Maps the statement's date, description and amount, written with a decimal comma, and answers its previewed rows. */
async function mapStatement(user: User) {
  await screen.findByRole('table', { name: 'The statement as uploaded' })
  await user.selectOptions(screen.getByLabelText('Date column'), 'Ngày')
  await user.selectOptions(screen.getByLabelText('Description column'), 'Mô tả')
  await user.selectOptions(screen.getByLabelText('Amount column'), 'Số tiền')
  await user.selectOptions(screen.getByLabelText('Decimal separator'), 'comma')
  const rows = within(await screen.findByRole('table', { name: 'Rows of the statement' }))
  await rows.findByRole('checkbox', { name: 'Import row 2' })
  return rows
}

const selected = (select: HTMLElement) => (select as HTMLSelectElement).selectedOptions[0]?.textContent

describe('categories from rules on an import', () => {
  it('starts each row on the category of the rule its description matches, offering only categories of its kind', async () => {
    fakeApis()
    const { user } = renderApp(`/import/${firstBatch}`)

    const rows = await mapStatement(user)

    expect(selected(rows.getByLabelText('Category for row 2'))).toBe('The category chosen below')
    expect(selected(rows.getByLabelText('Category for row 3'))).toBe('Salary')
    expect(selected(rows.getByLabelText('Category for row 4'))).toBe('Transport')
    expect(within(rows.getByLabelText('Category for row 3')).queryByRole('option', { name: 'Transport' })).not.toBeInTheDocument()
    expect(rows.getByLabelText('Category for row 4')).toHaveAccessibleDescription('Suggested by a categorisation rule.')
  })

  it('commits each row on the category it is left with, and asks for the batch’s only for rows without one', async () => {
    const importsApi = fakeApis()
    const { user } = renderApp(`/import/${firstBatch}`)
    const rows = await mapStatement(user)

    await user.selectOptions(rows.getByLabelText('Category for row 4'), 'c-eating-out')
    expect(rows.getByLabelText('Category for row 4')).not.toHaveAccessibleDescription()
    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))

    expect(await screen.findByText('Choose the category money going out is recorded on.')).toBeInTheDocument()
    expect(screen.queryByText('Choose the category money coming in is recorded on.')).not.toBeInTheDocument()
    expect(importsApi.commitRequests).toEqual([])

    await user.selectOptions(screen.getByLabelText('Category for money going out'), 'c-food')
    await user.click(screen.getByRole('button', { name: 'Import 3 transactions' }))

    await waitFor(() => expect(importsApi.commitRequests).toHaveLength(1))
    expect(importsApi.commitRequests[0]).toMatchObject({
      rows: [2, 3, 4],
      expenseCategoryId: 'c-food',
      incomeCategoryId: null,
      rowCategories: [
        { row: 3, categoryId: 'c-salary' },
        { row: 4, categoryId: 'c-eating-out' },
      ],
    })
    expect(await screen.findByRole('progressbar', { name: 'Importing transactions' })).toBeInTheDocument()
  })

  it('needs no category for the batch when every row chosen has one, and a row put back on the batch’s needs it again', async () => {
    const importsApi = fakeApis()
    const { user } = renderApp(`/import/${firstBatch}`)
    const rows = await mapStatement(user)

    await user.click(rows.getByRole('checkbox', { name: 'Import row 2' }))
    await user.selectOptions(rows.getByLabelText('Category for row 3'), '')
    await user.click(screen.getByRole('button', { name: 'Import 2 transactions' }))
    expect(await screen.findByText('Choose the category money coming in is recorded on.')).toBeInTheDocument()

    await user.selectOptions(rows.getByLabelText('Category for row 3'), 'c-interest')
    await user.click(screen.getByRole('button', { name: 'Import 2 transactions' }))

    await waitFor(() => expect(importsApi.commitRequests).toHaveLength(1))
    expect(importsApi.commitRequests[0]).toMatchObject({
      rows: [3, 4],
      expenseCategoryId: null,
      incomeCategoryId: null,
      rowCategories: [
        { row: 3, categoryId: 'c-interest' },
        { row: 4, categoryId: 'c-transport' },
      ],
    })
  })
})
