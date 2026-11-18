import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'

describe('language switch', () => {
  it('switches the whole interface to Vietnamese and back', async () => {
    const { user } = renderApp('/budgets')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'Tiếng Việt')

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(within(nav).getByRole('link', { name: 'Ngân sách' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('vi')
    expect(document.title).toBe('Quản lý Tài chính Cá nhân')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Ngôn ngữ' }), 'English')

    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Personal Finance Manager')
  })
})
