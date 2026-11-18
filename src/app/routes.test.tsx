import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'

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

    const nav = screen.getByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: link }))

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page')
  })
})

describe('a screen that fails', () => {
  function FailingScreen(): never {
    throw new Error('render failed')
  }

  it('shows an error inside the shell, and the rest of the app keeps working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { user } = renderApp('/failing', { extraScreens: [{ path: 'failing', Component: FailingScreen }] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText('render failed')).not.toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Budgets' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
  })
})

describe('unknown addresses', () => {
  it('show the not-found page inside the shell, with a way back to the dashboard', async () => {
    const { user } = renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Go to the dashboard' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })
})
