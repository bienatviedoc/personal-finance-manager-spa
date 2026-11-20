import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setScreenWidth } from '@/test/mediaQueries'
import { renderApp } from '@/test/renderApp'
import { testUser } from '@/test/server'

describe('navigation on a phone', () => {
  it('is a bottom tab bar of the main screens, with the rest under More', async () => {
    setScreenWidth(360)
    const { user, router } = renderApp('/budgets')

    const tabs = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(tabs).getAllByRole('link').map((link) => link.textContent)).toEqual(['Dashboard', 'Transactions', 'Budgets', 'Reports'])
    expect(within(tabs).getByRole('link', { name: 'Budgets' })).toHaveAttribute('aria-current', 'page')

    await user.click(within(tabs).getByRole('button', { name: 'More' }))

    const more = screen.getByRole('dialog', { name: 'More' })
    expect(within(more).getAllByRole('link').map((link) => link.textContent)).toEqual(['Accounts', 'Recurring', 'Import', 'Settings'])
    expect(within(more).getByText(testUser.email, { exact: false })).toBeInTheDocument()
    expect(within(more).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(within(more).getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
    expect(within(more).getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()

    await user.click(within(more).getByRole('link', { name: 'Accounts' }))

    expect(router.state.location.pathname).toBe('/accounts')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes More with Escape and puts focus back on the More button', async () => {
    setScreenWidth(360)
    const { user } = renderApp('/budgets')
    const moreButton = within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'More' })

    moreButton.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(moreButton).toHaveFocus()
  })

  it('becomes the sidebar again when the screen widens', async () => {
    setScreenWidth(360)
    renderApp('/budgets')
    expect(within(await screen.findByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()

    setScreenWidth(1024)

    const sidebar = screen.getByRole('navigation', { name: 'Main' })
    expect(within(sidebar).getByRole('link', { name: 'Accounts' })).toBeInTheDocument()
    expect(within(sidebar).queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })
})
