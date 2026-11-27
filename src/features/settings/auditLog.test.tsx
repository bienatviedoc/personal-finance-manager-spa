import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { auditEntry, fakeAuditLogApi } from '@/test/fakeAuditLogApi'
import { renderApp } from '@/test/renderApp'

describe('the audit log', () => {
  it('opens from the settings screen', async () => {
    fakeAuditLogApi()
    const { user } = renderApp('/settings')

    await user.click(await screen.findByRole('link', { name: 'Audit log' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Audit log' })).toBeInTheDocument()
    expect(document.title).toContain('Audit log')
    expect(await screen.findByText('Nothing has been recorded yet.')).toBeInTheDocument()
  })

  it('lists what the user did, the newest first, with when in their time zone and what the API says happened', async () => {
    fakeAuditLogApi([
      auditEntry({ id: 'e3', action: 'bulkDelete', entityType: 'transaction', at: '2026-11-20T08:00:00Z', summary: 'Deleted 3 transactions.' }),
      auditEntry({ id: 'e2', action: 'importCommit', entityType: 'importBatch', entityId: 'b1', at: '2026-11-19T02:30:00Z', summary: 'Committed the statement august.csv: 2 rows to import.' }),
      auditEntry({ id: 'e1', action: 'signIn', at: '2026-11-19T02:00:00Z' }),
    ])
    renderApp('/settings/audit-log')

    const rows = within(await screen.findByRole('list', { name: 'Audit log' })).getAllByRole('listitem')

    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Bulk delete')
    expect(rows[0]).toHaveTextContent('Deleted 3 transactions.')
    // 08:00 UTC is 15:00 in Ho Chi Minh City, the test user's time zone.
    expect(within(rows[0]!).getByText(/Nov 20, 2026.*3:00/)).toHaveAttribute('dateTime', '2026-11-20T08:00:00Z')
    expect(rows[1]).toHaveTextContent('Statement committed')
    expect(rows[2]).toHaveTextContent('Signed in')
    // Read only: nothing offers to change or remove an entry.
    expect(screen.queryByRole('button', { name: /delete|edit|remove/i })).not.toBeInTheDocument()
  })

  it('says what kind of thing each entry affected', async () => {
    fakeAuditLogApi([
      auditEntry({ id: 'e5', action: 'deletionRequest', entityType: 'user', entityId: 'u1', summary: 'Asked for their user to be deleted.' }),
      auditEntry({ id: 'e4', action: 'delete', entityType: 'categorisationRule', entityId: 'r1', summary: 'Deleted the categorisation rule for "grab".' }),
      auditEntry({ id: 'e3', action: 'delete', entityType: 'attachment', entityId: 'a1', summary: 'Removed the attachment receipt.pdf from a transaction.' }),
      auditEntry({ id: 'e2', action: 'bulkDelete', entityType: 'transaction', entityId: null, summary: 'Deleted 3 transactions.' }),
      auditEntry({ id: 'e1', action: 'importCommit', entityType: 'importBatch', entityId: 'b1', summary: 'Committed the statement august.csv: 2 rows to import.' }),
    ])
    renderApp('/settings/audit-log')

    const rows = within(await screen.findByRole('list', { name: 'Audit log' })).getAllByRole('listitem')

    expect(rows.map((row) => within(row).getByTestId('affected').textContent)).toEqual([
      'Asked to delete the profile · Profile',
      'Deleted · Categorisation rule',
      'Deleted · Attachment',
      'Bulk delete · Transactions',
      'Statement committed · Import',
    ])
  })

  it('loads older entries a page at a time', async () => {
    fakeAuditLogApi(Array.from({ length: 60 }, (_, index) => auditEntry({ id: `e${60 - index}`, summary: `Entry ${60 - index}.` })))
    const { user } = renderApp('/settings/audit-log')
    const list = await screen.findByRole('list', { name: 'Audit log' })

    expect(within(list).getAllByRole('listitem')).toHaveLength(50)

    await user.click(screen.getByRole('button', { name: 'Show older entries' }))

    expect(await within(list).findByText('Entry 1.')).toBeInTheDocument()
    expect(within(list).getAllByRole('listitem')).toHaveLength(60)
    expect(screen.queryByRole('button', { name: 'Show older entries' })).not.toBeInTheDocument()
  })

  it('says so when the log cannot be loaded', async () => {
    const api = fakeAuditLogApi()
    api.fail = true
    renderApp('/settings/audit-log')

    expect(await screen.findByRole('alert')).toHaveTextContent('The audit log could not be loaded. Try again in a little while.')
  })
})
