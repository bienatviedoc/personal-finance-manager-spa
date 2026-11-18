import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/renderApp'

describe('language switch', () => {
  it('switches the whole interface to Vietnamese and back', async () => {
    const { user } = renderApp('/budgets')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'Tiếng Việt')

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(within(nav).getByRole('link', { name: 'Ngân sách' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('vi')
    expect(document.title).toBe('Ngân sách · Quản lý Tài chính Cá nhân')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ngôn ngữ' }), 'English')

    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Budgets · Personal Finance Manager')
  })

  it('remembers a language the viewer chose, and stores nothing until they choose', async () => {
    const first = renderApp('/budgets', { language: 'detect' })
    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(localStorage.length).toBe(0)

    await first.user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'Tiếng Việt')
    first.unmount()

    renderApp('/budgets', { language: 'detect' })
    expect(screen.getByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
  })

  it('follows the browser language when the viewer has not chosen one', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['vi-VN', 'en-US'])

    renderApp('/budgets', { language: 'detect' })

    expect(screen.getByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
  })
})
