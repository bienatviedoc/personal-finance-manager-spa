import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Batch = components['schemas']['ImportBatchResponse']
type Mapping = components['schemas']['MappingResponse']
type Row = components['schemas']['PreviewRowResponse']
type Preview = components['schemas']['ImportPreviewResponse']
type CommitRequest = components['schemas']['CommitImportRequest']
type Account = components['schemas']['AccountResponse']
type Transaction = components['schemas']['TransactionResponse']
type Category = { id: string; kind: string; isArchived: boolean }

const separators: Record<string, string> = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' }
const decimals: Record<string, number> = { VND: 0, USD: 2, EUR: 2 }

type Options = {
  /** The accounts a statement may be uploaded for, as `fakeAccountsApi` keeps them. */
  accounts: Account[]
  /** The categories a commit may name, as `fakeCategoriesApi` keeps them. */
  categories: Category[]
  /** The transactions already on the accounts, as `fakeTransactionsApi` keeps them: what a likely duplicate is matched against. */
  transactions?: Transaction[]
  /** Statements uploaded before the test starts. */
  batches?: { accountId: string; fileName?: string; text: string }[]
  /** Today for the user: a row dated after it cannot be imported. */
  today?: string
}

/** A CSV text cut into rows and cells, as RFC 4180 has it, with any separator. */
function records(text: string, separator: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let started = false
  for (let at = 0; at < text.length; at++) {
    const character = text[at]
    if (quoted) {
      if (character === '"' && text[at + 1] === '"') {
        cell += '"'
        at++
      } else if (character === '"') quoted = false
      else cell += character
      continue
    }
    started = true
    if (character === '"' && cell === '') quoted = true
    else if (character === separator) {
      cells.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[at + 1] === '\n') at++
      rows.push([...cells, cell])
      cells = []
      cell = ''
      started = false
    } else cell += character
  }
  if (started || cell !== '' || cells.length > 0) rows.push([...cells, cell])
  return rows
}

const normalised = (description: string | null | undefined) =>
  (description ?? '').normalize('NFD').replace(/\p{Mn}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().split(/\s+/).filter(Boolean).join(' ')

/**
 * A stand-in for the API's statement import endpoints, keeping state across requests and following the same rules
 * as the real API (see the API's ImportTests): an upload is a form with `accountId` (an account not archived) and a
 * `file` that is text, answered with a first guess at the layout; the preview reads the file with the mapping in its
 * query, row by row (skipped, header, blank, parsed, failed with its problem, or unmapped), and marks a row with the
 * date, amount, direction and normalised description of a transaction on the account as a likely duplicate,
 * unticked, each transaction matching one row at most; a commit takes rows the preview parses, a category for each
 * direction chosen, and answers 202 with the batch committing (409 `import-committed` once committed). Nothing
 * imports by itself: `importNext` moves a committing batch on, as the worker would.
 */
export function fakeImportsApi({ accounts, categories, transactions = [], batches = [], today = '2026-11-20' }: Options) {
  type Kept = Batch & { text: string | null }
  let uploaded = 0
  const state = {
    batches: [] as Kept[],
    /** Every body a commit sent, in the order they arrived. */
    commitRequests: [] as CommitRequest[],
    /** Every query a preview was asked with. */
    previews: [] as Record<string, string>[],
  }

  const keep = (accountId: string, fileName: string, text: string) => {
    const batch: Kept = {
      id: `01970000-0000-7000-8000-6${String(uploaded++).padStart(11, '0')}`,
      accountId,
      fileName,
      status: 'uploaded',
      rowCount: 0,
      selectedCount: 0,
      importedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      failure: null,
      createdAt: '2026-11-20T09:00:00Z',
      committedAt: null,
      mapping: null,
      suggestedMapping: suggest(text),
      text,
    }
    state.batches.push(batch)
    return batch
  }
  for (const batch of batches) keep(batch.accountId, batch.fileName ?? 'statement.csv', batch.text)

  /** The batch as the API answers it: the file it keeps is not part of that. */
  const answer = (kept: Kept): Batch => {
    const batch: Partial<Kept> = { ...kept }
    delete batch.text
    return { ...(batch as Batch), suggestedMapping: kept.status === 'uploaded' ? kept.suggestedMapping : null }
  }
  const find = (id: unknown) => state.batches.find((batch) => batch.id === id)

  function suggest(text: string): Mapping {
    const [separator, rows] = Object.entries(separators)
      .map(([name, character]) => [name, records(text, character).slice(0, 50)] as const)
      .sort((a, b) => evenness(b[1]) - evenness(a[1]))[0]!
    const filled = rows.map((row) => row.filter((cell) => cell.trim() !== '').length)
    const first = filled.indexOf(Math.max(...filled))
    const header = rows[first] ?? []
    return {
      separator: separator as Mapping['separator'],
      skipFirstRows: Math.max(first, 0),
      hasHeaderRow: header.length > 0 && header.every((cell) => !/\d/.test(cell)),
      skipLastRows: 0,
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      debitColumn: null,
      creditColumn: null,
      dateFormat: 'dayMonthYear',
      decimalSeparator: 'dot',
    }
  }

  function evenness(rows: string[][]) {
    const counts = new Map<number, number>()
    for (const row of rows) if (row.length > 1) counts.set(row.length, (counts.get(row.length) ?? 0) + 1)
    return Math.max(0, ...counts.values())
  }

  const number = (value: string | null) => (value === null || value === '' ? null : Number(value))

  function mappingOf(query: URLSearchParams): Mapping | Record<string, string[]> {
    const errors: Record<string, string[]> = {}
    const separator = query.get('separator') ?? ''
    if (!(separator in separators)) errors.separator = ['Choose comma, semicolon, tab, pipe.']
    const columns = ['dateColumn', 'descriptionColumn', 'amountColumn', 'debitColumn', 'creditColumn'] as const
    for (const column of columns) {
      const value = number(query.get(column))
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > 199)) errors[column] = ['Choose a column from 0 to 199.']
    }
    if (query.get('amountColumn') && (query.get('debitColumn') || query.get('creditColumn'))) errors.amountColumn = ['Map one amount column, or a debit and a credit column, not both.']
    if (Object.keys(errors).length > 0) return errors
    return {
      separator: separator as Mapping['separator'],
      skipFirstRows: number(query.get('skipFirstRows')) ?? 0,
      hasHeaderRow: query.get('hasHeaderRow') === 'true',
      skipLastRows: number(query.get('skipLastRows')) ?? 0,
      dateColumn: number(query.get('dateColumn')),
      descriptionColumn: number(query.get('descriptionColumn')),
      amountColumn: number(query.get('amountColumn')),
      debitColumn: number(query.get('debitColumn')),
      creditColumn: number(query.get('creditColumn')),
      dateFormat: (query.get('dateFormat') ?? 'dayMonthYear') as Mapping['dateFormat'],
      decimalSeparator: (query.get('decimalSeparator') ?? 'dot') as Mapping['decimalSeparator'],
    }
  }

  const complete = (mapping: Mapping) =>
    mapping.dateColumn !== null && (mapping.amountColumn !== null ? mapping.debitColumn === null && mapping.creditColumn === null : mapping.debitColumn !== null && mapping.creditColumn !== null)

  function readDate(text: string, format: Mapping['dateFormat']) {
    const parts = text.match(/\d+/g)
    if (!parts || parts.length < 3 || /^[^\d]*[a-zA-Z]/.test(text)) return null
    const [first, second, third] = parts.map(Number) as [number, number, number]
    const [written, month, day] = format === 'dayMonthYear' ? [third, second, first] : format === 'monthDayYear' ? [third, first, second] : [first, second, third]
    const year = written < 100 ? written + 2000 : written
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return date.toISOString().slice(0, 10)
  }

  /** A signed amount, or null when it cannot be read. Test amounts are small, so a number holds them. */
  function readAmount(text: string, separator: Mapping['decimalSeparator']) {
    let written = text.trim()
    let negative = false
    if (written.startsWith('(') && written.endsWith(')')) {
      negative = true
      written = written.slice(1, -1)
    }
    if (written.includes('-')) negative = !negative
    const [decimalMark, groupMark] = separator === 'comma' ? [',', '.'] : ['.', ',']
    const digits = written.replaceAll(groupMark, '').replace(/[-+\s\p{L}\p{Sc}]/gu, '').replace(decimalMark, '.')
    if (!/^\d+(\.\d*)?$|^\.\d+$/.test(digits)) return null
    return (negative ? -1 : 1) * Number(digits)
  }

  function preview(batch: Kept, given: Mapping): Preview {
    const account = accounts.find((candidate) => candidate.id === batch.accountId)!
    const column = (value: number | string | null) => (value === null ? null : Number(value))
    const mapping = {
      ...given,
      skipFirstRows: Number(given.skipFirstRows),
      skipLastRows: Number(given.skipLastRows),
      dateColumn: column(given.dateColumn),
      descriptionColumn: column(given.descriptionColumn),
      amountColumn: column(given.amountColumn),
      debitColumn: column(given.debitColumn),
      creditColumn: column(given.creditColumn),
    }
    const all = records(batch.text ?? '', separators[mapping.separator]!)
    let last = all.length - 1
    while (last >= 0 && all[last]!.every((cell) => cell.trim() === '')) last--
    const footer = last + 1 - mapping.skipLastRows
    const header = mapping.hasHeaderRow ? (all[mapping.skipFirstRows] ?? []) : []
    const rows: Row[] = all.map((cells, index) => {
      const row: Row = { number: index + 1, cells, kind: 'unmapped', date: null, type: null, amount: null, description: null, problem: null, likelyDuplicate: false, selected: false }
      if (mapping.hasHeaderRow && index === mapping.skipFirstRows) return { ...row, kind: 'header' }
      if (index < mapping.skipFirstRows || (index >= footer && index <= last)) return { ...row, kind: 'skipped' }
      if (cells.every((cell) => cell.trim() === '')) return { ...row, kind: 'blank' }
      if (!complete(mapping)) return row
      const failed = (problem: Row['problem']): Row => ({ ...row, kind: 'failed', problem })
      const mapped = [mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn, mapping.debitColumn, mapping.creditColumn].filter((column) => column !== null)
      if (mapped.some((column) => column >= cells.length)) return failed('missingColumns')
      const dateText = cells[mapping.dateColumn!]!.trim()
      if (dateText === '') return failed('noDate')
      const date = readDate(dateText, mapping.dateFormat)
      if (!date) return failed('dateUnreadable')
      if (date > today) return failed('dateInFuture')
      let signed: number | null
      if (mapping.amountColumn !== null) {
        if (cells[mapping.amountColumn]!.trim() === '') return failed('noAmount')
        signed = readAmount(cells[mapping.amountColumn]!, mapping.decimalSeparator)
        if (signed === null) return failed('amountUnreadable')
        if (signed === 0) return failed('zeroAmount')
      } else {
        const debit = cells[mapping.debitColumn!]!.trim() === '' ? 0 : readAmount(cells[mapping.debitColumn!]!, mapping.decimalSeparator)
        const credit = cells[mapping.creditColumn!]!.trim() === '' ? 0 : readAmount(cells[mapping.creditColumn!]!, mapping.decimalSeparator)
        if (debit === null || credit === null) return failed('amountUnreadable')
        if (debit === 0 && credit === 0) return failed('noAmount')
        if (debit !== 0 && credit !== 0) return failed('debitAndCredit')
        signed = debit !== 0 ? -Math.abs(debit) : Math.abs(credit)
      }
      const amount = Math.abs(signed)
      if (Number(amount.toFixed(decimals[account.currency])) !== amount) return failed('tooManyDecimals')
      const description = mapping.descriptionColumn === null ? null : cells[mapping.descriptionColumn]!.trim().split(/\s+/).join(' ').slice(0, 200) || null
      return { ...row, kind: 'parsed', date, type: signed < 0 ? 'expense' : 'income', amount: amount.toFixed(2), description, selected: true }
    })

    const unmatched = transactions.filter((transaction) => transaction.accountId === batch.accountId && (transaction.type === 'income' || transaction.type === 'expense'))
    for (const row of rows.filter((candidate) => candidate.kind === 'parsed')) {
      const match = unmatched.findIndex(
        (transaction) =>
          transaction.date === row.date &&
          Number(transaction.amount) === Number(row.amount) &&
          (transaction.type === 'income' || transaction.isRefund ? 'income' : 'expense') === row.type &&
          normalised(transaction.payee) === normalised(row.description),
      )
      if (match >= 0) {
        unmatched.splice(match, 1)
        Object.assign(row, { likelyDuplicate: true, selected: false })
      }
    }

    const count = (test: (row: Row) => boolean) => rows.filter(test).length
    return {
      header,
      columnCount: Math.max(0, ...all.map((cells) => cells.length)),
      currency: account.currency,
      rows,
      counts: {
        parsed: count((row) => row.kind === 'parsed'),
        failed: count((row) => row.kind === 'failed'),
        likelyDuplicates: count((row) => row.likelyDuplicate),
        selected: count((row) => row.selected),
      },
    }
  }

  const committed = () => problem(409, { type: 'urn:pfm:problem:import-committed' })

  server.use(
    http.post(apiUrl('/api/v1/imports'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const form = await request.formData()
      const accountId = form.get('accountId')
      const file = form.get('file')
      const errors: Record<string, string[]> = {}
      const account = accounts.find((candidate) => candidate.id === accountId)
      if (!account || account.isArchived) errors.accountId = ['Choose one of your accounts that is not archived.']
      let text = ''
      if (!(file instanceof File) || file.size === 0) errors.file = ['This file is empty.']
      else if (file.size > 5 * 1024 * 1024) errors.file = ['Upload a CSV file of at most 5 MB.']
      else {
        text = (await file.text()).replace(/^\u{FEFF}/u, '')
        if (text.includes('\0') || text.includes('\u{FFFD}')) errors.file = ['Upload a CSV file saved as text (UTF-8).']
      }
      if (Object.keys(errors).length > 0) return problem(400, { errors })
      const batch = keep(account!.id, (file as File).name, text)
      return HttpResponse.json(answer(batch), { status: 201, headers: { Location: `/api/v1/imports/${batch.id}` } })
    }),
    http.get(apiUrl('/api/v1/imports/:id'), ({ params }) => {
      const batch = find(params.id)
      return batch ? HttpResponse.json(answer(batch)) : problem(404)
    }),
    http.get(apiUrl('/api/v1/imports/:id/preview'), ({ request, params }) => {
      const batch = find(params.id)
      if (!batch) return problem(404)
      const query = new URL(request.url).searchParams
      state.previews.push(Object.fromEntries(query))
      if (batch.status !== 'uploaded') return committed()
      const mapping = mappingOf(query)
      if (!('separator' in mapping) || typeof mapping.separator !== 'string') return problem(400, { errors: mapping })
      return HttpResponse.json(preview(batch, mapping as Mapping))
    }),
    http.post(apiUrl('/api/v1/imports/:id/commit'), async ({ request, params }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      const body = (await request.json()) as CommitRequest
      state.commitRequests.push(body)
      const batch = find(params.id)
      if (!batch) return problem(404)
      if (batch.status !== 'uploaded') return committed()
      const query = new URLSearchParams(Object.entries(body.mapping ?? {}).filter(([, value]) => value !== null).map(([name, value]) => [name, String(value)]))
      const mapping = mappingOf(query)
      if (!('separator' in mapping) || typeof mapping.separator !== 'string') return problem(400, { errors: { mapping: ['Send the mapping.'] } })
      if (!complete(mapping as Mapping)) return problem(400, { errors: { mapping: ['Choose the date column and the amount column, or the debit and credit columns.'] } })
      const read = preview(batch, mapping as Mapping)
      const chosen = [...new Set(body.rows ?? [])]
      const parsed = new Map(read.rows.filter((row) => row.kind === 'parsed').map((row) => [row.number, row]))
      if (chosen.length === 0 || chosen.some((row) => !parsed.has(row))) return problem(400, { errors: { rows: ['Choose rows the preview reads as transactions.'] } })
      const errors: Record<string, string[]> = {}
      for (const [field, kind] of [['expenseCategoryId', 'expense'], ['incomeCategoryId', 'income']] as const) {
        const needed = chosen.some((row) => parsed.get(row)!.type === kind)
        const id = body[field]
        const category = categories.find((candidate) => candidate.id === id)
        if ((needed && !id) || (id && (!category || category.isArchived || category.kind !== kind))) errors[field] = [`Choose one of your ${kind} categories that is not archived.`]
      }
      if (Object.keys(errors).length > 0) return problem(400, { errors })
      Object.assign(batch, {
        status: 'committing',
        mapping,
        rowCount: Number(read.counts.parsed) + Number(read.counts.failed),
        selectedCount: chosen.length,
        duplicateCount: read.rows.filter((row) => row.likelyDuplicate && !chosen.includes(row.number)).length,
        failedCount: read.counts.failed,
      })
      return HttpResponse.json(answer(batch), { status: 202, headers: { Location: `/api/v1/imports/${batch.id}` } })
    }),
  )

  return {
    ...state,
    /** Imports the next rows of a committing batch, as the worker does; all that are left when no count is given. */
    importNext(id: string, rows?: number) {
      const batch = find(id)!
      batch.importedCount = Math.min(Number(batch.selectedCount), Number(batch.importedCount) + (rows ?? Number(batch.selectedCount)))
      if (batch.importedCount === Number(batch.selectedCount)) Object.assign(batch, { status: 'committed', committedAt: '2026-11-20T09:01:00Z', text: null })
    },
    /** Stops a batch, as the worker does when its rows can no longer be recorded, for the reason given. */
    fail(id: string, failure: NonNullable<Batch['failure']>) {
      Object.assign(find(id)!, { status: 'failed', failure, text: null })
    },
  }
}
