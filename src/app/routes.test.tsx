import { screen, waitFor, within } from '@testing-library/react'
import { data } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { failingScreen, renderApp } from '@/test/renderApp'

describe('app navigation', () => {
  it.each([
    ['Dashboard', 'Dashboard'],
    ['Transactions', 'Transactions'],
    ['Accounts', 'Accounts'],
    ['Budgets', 'Budgets'],
    ['Reports', 'Reports'],
    ['Recurring', 'Recurring'],
    ['Import', 'Import statement'],
    ['Settings', 'Settings'],
  ])('the sidebar link "%s" opens the %s screen', async (link, heading) => {
    const { user } = renderApp('/transactions')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: link }))

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
  })

  it('names the current screen in the browser tab title', async () => {
    const { user } = renderApp('/transactions')
    await waitFor(() => expect(document.title).toBe('Transactions · Personal Finance Manager'))

    await user.click(await screen.findByRole('link', { name: 'Budgets' }))

    await waitFor(() => expect(document.title).toBe('Budgets · Personal Finance Manager'))
  })
})

describe('a screen that fails', () => {
  it('shows an error inside the shell, and the rest of the app keeps working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderApp('/failing', { extraScreens: [failingScreen] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText('render failed')).not.toBeInTheDocument()

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Budgets' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
  })
})

describe('unknown addresses', () => {
  it('show the not-found page when a screen reports that what it was asked for does not exist', async () => {
    renderApp('/accounts-missing', {
      extraScreens: [
        {
          path: 'accounts-missing',
          loader: () => {
            throw data(null, { status: 404 })
          },
          Component: () => null,
        },
      ],
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(document.title).toBe('Page not found · Personal Finance Manager')
  })

  it('show the not-found page inside the shell, with a way back to the dashboard', async () => {
    const { user } = renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go to the dashboard' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})
