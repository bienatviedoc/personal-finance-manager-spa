import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import { setSystemTheme } from '@/test/mediaQueries'
import { renderApp } from '@/test/renderApp'
import { server, signedOut } from '@/test/server'

const isDark = () => document.documentElement.classList.contains('dark')

/** Runs the script in index.html that sets the theme before the app loads, as a browser does on a reload. */
function runPrePaintScript() {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1]
  if (!script) throw new Error('index.html has no inline script.')
  window.eval(script)
}

/** Puts index.html's theme-color tags in the page and returns a reader of the colour each system theme gets. */
function addBarColors() {
  const tags = [...indexHtml.matchAll(/<meta name="theme-color"[^>]*>/g)].map(([tag]) => tag)
  document.head.insertAdjacentHTML('beforeend', tags.join(''))
  const colorFor = (theme: 'light' | 'dark') =>
    document.head.querySelector(`meta[name="theme-color"][media*="${theme}"]`)?.getAttribute('content')
  return () => ({ light: colorFor('light'), dark: colorFor('dark') })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove()
})

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

  it('is offered on the signed-out screens too', async () => {
    setSystemTheme('light')
    server.use(signedOut())
    const { user } = renderApp('/login')
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Theme' }), 'Dark')

    expect(isDark()).toBe(true)
  })

  it('colours the browser bar for the chosen theme, and for the system theme again once following it', async () => {
    setSystemTheme('light')
    const barColors = addBarColors()
    const system = barColors()
    expect(system.light).not.toBe(system.dark)
    const { user } = renderApp('/budgets')

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Theme' }), 'Dark')
    expect(barColors()).toEqual({ light: system.dark, dark: system.dark })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'Light')
    expect(barColors()).toEqual({ light: system.light, dark: system.light })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'Same as system')
    expect(barColors()).toEqual(system)
  })

  it('is already the chosen theme before the app loads on a reload', async () => {
    setSystemTheme('light')
    const { user, unmount } = renderApp('/budgets')
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Theme' }), 'Dark')
    unmount()
    document.documentElement.classList.remove('dark')

    runPrePaintScript()

    expect(isDark()).toBe(true)
  })

  it('follows the system before the app loads when the browser blocks storage', () => {
    setSystemTheme('dark')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    runPrePaintScript()

    expect(isDark()).toBe(true)
  })

  it('keeps a choice the browser could not store until one it can, then goes by what is stored', async () => {
    setSystemTheme('light')
    const { user } = renderApp('/budgets')
    const theme = await screen.findByRole('combobox', { name: 'Theme' })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    await user.selectOptions(theme, 'Dark')
    expect(isDark()).toBe(true)
    expect(theme).toHaveDisplayValue('Dark')

    await user.selectOptions(theme, 'Same as system')
    expect(isDark()).toBe(false)
    expect(theme).toHaveDisplayValue('Same as system')
  })
})
