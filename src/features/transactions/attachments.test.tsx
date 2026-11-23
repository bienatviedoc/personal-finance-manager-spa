import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeAttachmentsApi } from '@/test/fakeAttachmentsApi'
import { defaultTestCategories, fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { fakeTransactionsApi } from '@/test/fakeTransactionsApi'
import { renderApp } from '@/test/renderApp'

const lunch = '01970000-0000-7000-8000-300000000000'
const taxi = '01970000-0000-7000-8000-300000000001'

/** The first bytes of a JPEG, a PNG and a PDF: what the API tells a file by. */
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]
const pdf = [...'%PDF-1.7\n'].map((character) => character.charCodeAt(0))

/** A file as the user picks it: named, typed by the browser, starting with these bytes and this many bytes long. */
function file(name: string, type: string, start: number[], size = start.length) {
  const bytes = new Uint8Array(size)
  bytes.set(start)
  return new File([bytes], name, { type })
}

function fakeApis(attachments: Parameters<typeof fakeAttachmentsApi>[0] = []) {
  fakeInstitutionsApi()
  const accountsApi = fakeAccountsApi([{ name: 'Everyday' }])
  const categoriesApi = fakeCategoriesApi({ categories: defaultTestCategories })
  const transactionsApi = fakeTransactionsApi(
    [
      { id: lunch, payee: 'Lunch', amount: '85000.00' },
      { id: taxi, payee: 'Taxi', amount: '45000.00' },
    ],
    { accounts: accountsApi.accounts, categories: categoriesApi.categories },
  )
  return fakeAttachmentsApi(attachments, { transactions: transactionsApi.transactions })
}

/** Opens the drawer of a transaction and answers its attachments section, once loaded. */
async function attachmentsOf(user: ReturnType<typeof renderApp>['user'], payee: string) {
  await user.click(await screen.findByRole('button', { name: `Edit ${payee}` }))
  const section = within(await screen.findByRole('region', { name: 'Attachments' }))
  await waitFor(() => expect(section.queryByText('Loading attachments')).not.toBeInTheDocument())
  return section
}

/** Each listed attachment: its name and its size, as written. */
function listed(section: Awaited<ReturnType<typeof attachmentsOf>>) {
  return section.queryAllByRole('listitem').map((item) => [within(item).getByTestId('name').textContent, within(item).getByTestId('size').textContent])
}

/** The tab the browser opens for a file: `window.open` answers it, and the test reads where it was sent. */
function fakeTab() {
  const tab = { opener: window as Window | null, location: { replace: vi.fn<(url: string) => void>() }, close: vi.fn() }
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  return { tab, open }
}

describe('attachments', () => {
  it('are listed in the drawer of the transaction they are attached to, each with its name and size', async () => {
    fakeApis([
      { transactionId: lunch, fileName: 'lunch.jpg', contentType: 'image/jpeg', size: 48_213 },
      { transactionId: lunch, fileName: 'Hoá đơn tháng 11.pdf', size: 1_572_864 },
      { transactionId: taxi, fileName: 'taxi.png', contentType: 'image/png', size: 512 },
    ])
    const { user } = renderApp('/transactions')

    const section = await attachmentsOf(user, 'Lunch')

    expect(listed(section)).toEqual([
      ['lunch.jpg', '47 kB'],
      ['Hoá đơn tháng 11.pdf', '1.5 MB'],
    ])
    expect(section.getByText('JPEG, PNG or PDF, up to 5 MB each.')).toBeInTheDocument()
  })

  it('say so when a transaction has none, and are not offered for a transaction that is not recorded yet', async () => {
    fakeApis()
    const { user } = renderApp('/transactions')

    const section = await attachmentsOf(user, 'Taxi')
    expect(section.getByText('No attachments yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: 'Add transaction' }))
    expect(await screen.findByRole('dialog', { name: 'New transaction' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Attachments' })).not.toBeInTheDocument()
  })

  it.each([
    ['a JPEG', file('lunch.jpg', 'image/jpeg', jpeg, 2048), ['lunch.jpg', '2 kB'], 'image/jpeg'],
    ['a PNG', file('scan.png', 'image/png', png, 300), ['scan.png', '300 byte'], 'image/png'],
    ['a PDF of exactly 5 MB', file('invoice.pdf', 'application/pdf', pdf, 5 * 1024 * 1024), ['invoice.pdf', '5 MB'], 'application/pdf'],
  ])('attach %s chosen in the drawer, which is then listed', async (_what, chosen, row, contentType) => {
    const attachmentsApi = fakeApis()
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')

    await user.upload(section.getByLabelText('Attach a receipt'), chosen)

    await waitFor(() => expect(listed(section)).toEqual([row]))
    expect(attachmentsApi.attachments).toEqual([expect.objectContaining({ transactionId: lunch, fileName: row[0], contentType, size: chosen.size })])
    expect(section.queryByText('No attachments yet.')).not.toBeInTheDocument()
  })

  it('refuse a file that is not a JPEG, PNG or PDF, or is over 5 MB, or is empty, before anything is sent, saying what can be attached', async () => {
    const attachmentsApi = fakeApis()
    // Without the input's own filter, so the screen's check is what answers.
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')
    const input = section.getByLabelText('Attach a receipt')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,application/pdf')
    input.removeAttribute('accept')

    await user.upload(input, file('notes.txt', 'text/plain', [0x68, 0x69]))
    expect(await section.findByRole('alert')).toHaveTextContent('notes.txt is not a JPEG, PNG or PDF file.')

    await user.upload(input, file('huge.pdf', 'application/pdf', pdf, 5 * 1024 * 1024 + 1))
    expect(await section.findByRole('alert')).toHaveTextContent('huge.pdf is larger than 5 MB.')

    await user.upload(input, file('empty.pdf', 'application/pdf', []))
    expect(await section.findByRole('alert')).toHaveTextContent('empty.pdf is empty.')

    expect(attachmentsApi.uploads).toBe(0)
    expect(input).toBeInvalid()

    await user.upload(input, file('lunch.jpg', 'image/jpeg', jpeg))
    await waitFor(() => expect(listed(section)).toHaveLength(1))
    expect(section.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('say what can be attached when the API refuses a file that is not what its name says', async () => {
    const attachmentsApi = fakeApis()
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')

    await user.upload(section.getByLabelText('Attach a receipt'), file('receipt.pdf', 'application/pdf', [0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]))

    expect(await section.findByRole('alert')).toHaveTextContent('receipt.pdf could not be attached. Attach a JPEG, PNG or PDF file of at most 5 MB.')
    expect(attachmentsApi.uploads).toBe(1)
    expect(listed(section)).toEqual([])
  })

  it('open in a new tab through a signed URL asked for at that moment, and never kept', async () => {
    const attachmentsApi = fakeApis([{ transactionId: lunch, fileName: 'lunch.jpg', contentType: 'image/jpeg' }])
    const { tab, open } = fakeTab()
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')
    expect(attachmentsApi.signedUrls).toEqual([])

    await user.click(section.getByRole('button', { name: 'Open lunch.jpg' }))

    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(attachmentsApi.signedUrls[0]))
    expect(open).toHaveBeenCalledWith('', '_blank')
    // The file is another site's page: it gets no handle on the app.
    expect(tab.opener).toBeNull()

    await user.click(section.getByRole('button', { name: 'Open lunch.jpg' }))
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledTimes(2))
    expect(attachmentsApi.signedUrls).toHaveLength(2)
    expect(tab.location.replace).toHaveBeenLastCalledWith(attachmentsApi.signedUrls[1])
  })

  it('are removed after the user confirms', async () => {
    const attachmentsApi = fakeApis([
      { transactionId: lunch, fileName: 'lunch.jpg', contentType: 'image/jpeg' },
      { transactionId: lunch, fileName: 'tip.png', contentType: 'image/png' },
    ])
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')

    await user.click(section.getByRole('button', { name: 'Remove tip.png' }))
    const confirm = within(section.getByRole('group', { name: 'Remove tip.png' }))
    expect(confirm.getByText('Remove tip.png? Its file is deleted.')).toBeInTheDocument()
    expect(attachmentsApi.attachments).toHaveLength(2)
    await user.click(confirm.getByRole('button', { name: 'Cancel' }))
    expect(section.queryByRole('group', { name: 'Remove tip.png' })).not.toBeInTheDocument()

    await user.click(section.getByRole('button', { name: 'Remove tip.png' }))
    await user.click(within(section.getByRole('group', { name: 'Remove tip.png' })).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(listed(section).map(([name]) => name)).toEqual(['lunch.jpg']))
    expect(attachmentsApi.attachments.map((attachment) => attachment.fileName)).toEqual(['lunch.jpg'])
  })

  it('say in a toast when attaching, opening or removing fails, and do it when the user tries again', async () => {
    const attachmentsApi = fakeApis([{ transactionId: lunch, fileName: 'lunch.jpg', contentType: 'image/jpeg' }])
    const { tab } = fakeTab()
    const { user } = renderApp('/transactions')
    const section = await attachmentsOf(user, 'Lunch')

    attachmentsApi.failNext()
    await user.upload(section.getByLabelText('Attach a receipt'), file('tip.png', 'image/png', png))
    expect(await section.findByText('The receipt was not attached.')).toBeInTheDocument()
    expect(attachmentsApi.attachments).toHaveLength(1)
    await user.click(section.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(listed(section).map(([name]) => name)).toEqual(['lunch.jpg', 'tip.png']))
    expect(section.queryByText('The receipt was not attached.')).not.toBeInTheDocument()

    attachmentsApi.failNext()
    await user.click(section.getByRole('button', { name: 'Open lunch.jpg' }))
    expect(await section.findByText('The attachment could not be opened.')).toBeInTheDocument()
    // The tab opened for it is not left empty.
    expect(tab.close).toHaveBeenCalledTimes(1)
    expect(tab.location.replace).not.toHaveBeenCalled()
    await user.click(section.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(attachmentsApi.signedUrls[0]))

    await user.click(section.getByRole('button', { name: 'Remove lunch.jpg' }))
    attachmentsApi.failNext()
    await user.click(within(section.getByRole('group', { name: 'Remove lunch.jpg' })).getByRole('button', { name: 'Remove' }))
    expect(await section.findByText('The attachment was not removed.')).toBeInTheDocument()
    expect(attachmentsApi.attachments).toHaveLength(2)
    await user.click(section.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(attachmentsApi.attachments.map((attachment) => attachment.fileName)).toEqual(['tip.png']))
  })

  it('say so when they cannot be loaded', async () => {
    const attachmentsApi = fakeApis([{ transactionId: lunch, fileName: 'lunch.jpg' }])
    attachmentsApi.failNext()
    const { user } = renderApp('/transactions')

    await user.click(await screen.findByRole('button', { name: 'Edit Lunch' }))

    const section = within(await screen.findByRole('region', { name: 'Attachments' }))
    expect(await section.findByRole('alert')).toHaveTextContent('The attachments could not be loaded.')
  })

  it('write sizes the way the interface language does', async () => {
    fakeApis([{ transactionId: lunch, fileName: 'Hoá đơn.pdf', size: 1_572_864 }])
    const { user } = renderApp('/transactions', { language: 'vi' })

    await user.click(await screen.findByRole('button', { name: 'Sửa Lunch' }))

    const section = within(await screen.findByRole('region', { name: 'Tệp đính kèm' }))
    expect(await section.findByTestId('size')).toHaveTextContent('1,5 MB')
  })
})
