import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { http } from 'msw'
import { fakeProfileApi } from '@/test/fakeProfileApi'
import { apiUrl, problem, server } from '@/test/server'

describe('profile settings', () => {
  it('open from the settings screen', async () => {
    fakeProfileApi()
    const { router } = renderApp('/settings')

    expect(await screen.findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings/profile')
  })

  it('show the user’s base currency, time zone and language, and save changes to them', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const currency = await screen.findByRole('combobox', { name: 'Base currency' })
    expect(currency).toHaveDisplayValue('Vietnamese Dong (VND)')
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue('Asia/Ho_Chi_Minh')

    await user.selectOptions(currency, 'EUR')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time zone' }), 'Europe/Berlin')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your settings are saved.')
    expect(api.changes).toEqual([{ baseCurrency: 'EUR', timeZone: 'Europe/Berlin', locale: 'en' }])
    expect(api.profile).toMatchObject({ baseCurrency: 'EUR', timeZone: 'Europe/Berlin', locale: 'en' })
  })

  it('show how amounts will look in the chosen currency and language', async () => {
    fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const example = await screen.findByTestId('amount-example')
    expect(example).toHaveTextContent('₫1,234,568')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Base currency' }), 'USD')
    expect(example).toHaveTextContent('$1,234,567.89')
  })

  it('switch the whole interface to Vietnamese when the language is changed and saved', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const form = await screen.findByRole('form', { name: 'Profile' })
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Language' }), 'vi')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Cài đặt' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(within(nav).getByRole('link', { name: 'Ngân sách' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('vi')
    expect(screen.getByTestId('amount-example')).toHaveTextContent('1.234.568 ₫')
    expect(api.profile.locale).toBe('vi')
  })

  it('a language saved in the profile takes over from the browser’s', async () => {
    fakeProfileApi({ locale: 'vi' })

    renderApp('/budgets')

    expect(await screen.findByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
  })

  it('a language picked in the sidebar is saved to the profile', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/budgets')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const sidebar = nav.parentElement!
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Language' }), 'Tiếng Việt')

    await waitFor(() => expect(api.profile.locale).toBe('vi'))
    expect(screen.getByRole('heading', { level: 1, name: 'Ngân sách' })).toBeInTheDocument()
  })

  it('say so when the settings could not be saved, and keep what the user chose', async () => {
    fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')
    server.use(http.patch(apiUrl('/api/v1/me'), () => problem(500)))

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Base currency' }), 'USD')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your settings could not be saved. Try again.')
    expect(screen.getByRole('combobox', { name: 'Base currency' })).toHaveValue('USD')
  })
})
