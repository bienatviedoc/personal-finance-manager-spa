import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeInstitutionsApi } from '@/test/fakeInstitutionsApi'
import { renderApp } from '@/test/renderApp'

describe('institutions', () => {
  it('are listed from the accounts area, by name', async () => {
    fakeInstitutionsApi([{ name: 'Vietcombank' }, { name: 'MoMo', logoKey: 'wallet' }, { name: 'Old bank', isArchived: true }])
    fakeAccountsApi()
    const { user } = renderApp('/accounts')

    await user.click(await screen.findByRole('link', { name: 'Institutions' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Institutions' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Institutions' })
    expect(within(list).getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent)).toEqual(['MoMo', 'Vietcombank'])
  })

  it('are all listed, however many pages the API answers in', async () => {
    fakeInstitutionsApi(Array.from({ length: 51 }, (_, index) => ({ name: `Bank ${String(index + 1).padStart(2, '0')}` })))
    renderApp('/accounts/institutions')

    const list = await screen.findByRole('list', { name: 'Institutions' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(51)
    expect(within(list).getByRole('heading', { name: 'Bank 51' })).toBeInTheDocument()
  })

  it('can be added with a name, a colour and a logo', async () => {
    const api = fakeInstitutionsApi()
    const { user } = renderApp('/accounts/institutions')

    expect(await screen.findByText('No institutions yet. Add the banks and wallet providers you hold money with.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add institution' }))
    await user.type(screen.getByLabelText('Name'), 'Techcombank')
    await user.click(within(screen.getByRole('group', { name: 'Colour' })).getByRole('radio', { name: 'Red' }))
    await user.click(within(screen.getByRole('group', { name: 'Logo' })).getByRole('radio', { name: 'Bank' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const list = await screen.findByRole('list', { name: 'Institutions' })
    expect(within(list).getByRole('heading', { name: 'Techcombank' })).toBeInTheDocument()
    expect(api.institutions).toEqual([expect.objectContaining({ name: 'Techcombank', color: '#ef4444', logoKey: 'bank' })])
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('can be edited, including taking the colour and logo away', async () => {
    const api = fakeInstitutionsApi([{ name: 'MoMo', color: '#ec4899', logoKey: 'wallet' }])
    const { user } = renderApp('/accounts/institutions')

    await user.click(await screen.findByRole('button', { name: 'Edit MoMo' }))
    expect(within(screen.getByRole('group', { name: 'Colour' })).getByRole('radio', { name: 'Pink' })).toBeChecked()
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'MoMo wallet')
    await user.click(within(screen.getByRole('group', { name: 'Colour' })).getByRole('radio', { name: 'None' }))
    await user.click(within(screen.getByRole('group', { name: 'Logo' })).getByRole('radio', { name: 'None' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { name: 'MoMo wallet' })).toBeInTheDocument()
    expect(api.institutions).toEqual([expect.objectContaining({ name: 'MoMo wallet', color: null, logoKey: null })])
  })

  it('need a name, which is checked before contacting the API', async () => {
    const api = fakeInstitutionsApi()
    const { user } = renderApp('/accounts/institutions')

    await user.click(await screen.findByRole('button', { name: 'Add institution' }))
    await user.type(screen.getByLabelText('Name'), '   ')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(api.institutions).toEqual([])
  })

  it('show a problem only the API could find next to the field it concerns', async () => {
    fakeInstitutionsApi([{ name: 'Vietcombank', color: 'not-a-colour' }])
    const { user } = renderApp('/accounts/institutions')

    await user.click(await screen.findByRole('button', { name: 'Edit Vietcombank' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose one of the colours.')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('leave the list when archived, after the user confirms', async () => {
    const api = fakeInstitutionsApi([{ name: 'ACB' }, { name: 'Old bank' }])
    const { user } = renderApp('/accounts/institutions')

    await user.click(await screen.findByRole('button', { name: 'Archive Old bank' }))
    const confirmation = screen.getByRole('group', { name: 'Archive Old bank' })
    expect(within(confirmation).getByText('Archive Old bank? It leaves pickers and lists, and stays on the accounts that already use it.')).toBeInTheDocument()
    await user.click(within(confirmation).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Old bank' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'ACB' })).toBeInTheDocument()
    expect(api.institutions.find((institution) => institution.name === 'Old bank')?.isArchived).toBe(true)
  })

  it('stay as they are when the user cancels archiving', async () => {
    const api = fakeInstitutionsApi([{ name: 'ACB' }])
    const { user } = renderApp('/accounts/institutions')

    await user.click(await screen.findByRole('button', { name: 'Archive ACB' }))
    await user.click(within(screen.getByRole('group', { name: 'Archive ACB' })).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('group', { name: 'Archive ACB' })).not.toBeInTheDocument()
    expect(api.institutions[0]?.isArchived).toBe(false)
  })
})
