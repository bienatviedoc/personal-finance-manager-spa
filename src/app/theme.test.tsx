import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setSystemTheme } from '@/test/mediaQueries'
import { renderApp } from '@/test/renderApp'

const isDark = () => document.documentElement.classList.contains('dark')

describe('theme', () => {
  it('follows the system theme, including when it changes', async () => {
    setSystemTheme('dark')
    renderApp('/budgets')
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(isDark()).toBe(true)

    setSystemTheme('light')

    expect(isDark()).toBe(false)
  })

  it('can be set to light or dark whatever the system says, which is remembered, and set back to follow the system', async () => {
    setSystemTheme('light')
    const first = renderApp('/budgets')

    await first.user.selectOptions(await screen.findByRole('combobox', { name: 'Theme' }), 'Dark')
    expect(isDark()).toBe(true)
    setSystemTheme('dark')
    setSystemTheme('light')
    expect(isDark()).toBe(true)
    first.unmount()

    const second = renderApp('/budgets')
    expect(await screen.findByRole('combobox', { name: 'Theme' })).toHaveDisplayValue('Dark')
    expect(isDark()).toBe(true)

    await second.user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'Same as system')
    expect(isDark()).toBe(false)
    setSystemTheme('dark')
    expect(isDark()).toBe(true)
  })
})
