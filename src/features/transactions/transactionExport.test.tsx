import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { catchDownloads, textOf, type SavedFile } from '@/test/downloads'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server } from '@/test/server'

const exportFileName = 'transactions-2026-11-20.csv'
const exported = 'date,type,isRefund,account,category,payee,note,amount,currency\r\n2026-11-02,expense,false,Everyday,Groceries,Co.opmart,,125000.00,VND\r\n'

/**
 * The transactions and, beside them, the export the API writes (see the API's TransactionExportTests). The export
 * of every transaction that passes is the API's: the app sends the filters and saves the file it answers.
 * Returns the queries the export was asked with.
 */
function fakeApis() {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday', openingBalance: '1000000.00' }])
  const categoriesApi = fakeCategoriesApi()
  fakeTransactionsApi(
    [{ type: 'expense', accountId: accountsApi.accounts[0]!.id, amount: '125000.00', date: '2026-11-02', categoryId: 'c-groceries', payee: 'Co.opmart' }],
    { accounts: accountsApi.accounts, categories: categoriesApi.categories },
  )
  const asked: Record<string, string>[] = []
  server.use(
    http.get(apiUrl('/api/v1/export/transactions.csv'), ({ request }) => {
      asked.push(Object.fromEntries(new URL(request.url).searchParams))
      return new HttpResponse(new TextEncoder().encode(`\u{FEFF}${exported}`), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename=${exportFileName}; filename*=UTF-8''${exportFileName}` },
      })
    }),
  )
  return asked
}

describe('exporting the transaction list', () => {
  let saved: SavedFile[] = []

  beforeEach(() => {
    saved = catchDownloads()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads every transaction that passes the filters in the address as the CSV file the API writes, not just the loaded page', async () => {
    const asked = fakeApis()
    const { user } = renderApp('/transactions?type=expense&q=co.opmart&sort=amount&order=asc')

    await user.click(await screen.findByRole('button', { name: 'Export CSV' }, { timeout: 5000 }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(asked).toEqual([{ type: 'expense', q: 'co.opmart', sort: 'amount', order: 'asc' }])
    expect(saved[0]?.name).toBe(exportFileName)
    expect(await textOf(saved[0]?.file)).toEqual({ hasByteOrderMark: true, text: exported })
  })

  it('says in a toast when the export fails, and downloads it when the user tries again', async () => {
    const asked = fakeApis()
    server.use(http.get(apiUrl('/api/v1/export/transactions.csv'), () => problem(500), { once: true }))
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Export CSV' }, { timeout: 5000 }))

    expect(await screen.findByText('The CSV file could not be downloaded. Try again in a moment.')).toBeInTheDocument()
    expect(saved).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(asked).toEqual([{}])
  })
})
