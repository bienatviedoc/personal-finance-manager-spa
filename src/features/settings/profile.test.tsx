import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { http } from 'msw'
import { fakeBudgetNotificationsApi } from '@/test/fakeBudgetNotificationsApi'
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
    expect(api.changes).toEqual([{ baseCurrency: 'EUR', timeZone: 'Europe/Berlin', locale: 'en', budgetWarningPercent: 80, emailBudgetNotifications: true }])
    expect(api.profile).toMatchObject({ baseCurrency: 'EUR', timeZone: 'Europe/Berlin', locale: 'en' })
  })

  it('show the budget warning threshold, and save another', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const threshold = await screen.findByRole('spinbutton', { name: 'Budget warning threshold (%)' })
    expect(threshold).toHaveValue(80)
    expect(threshold).toHaveAccessibleDescription('A budget’s state becomes a warning once this share of it is spent.')

    await user.clear(threshold)
    await user.type(threshold, '90')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your settings are saved.')
    expect(api.profile.budgetWarningPercent).toBe(90)
    expect(threshold).toHaveValue(90)
  })

  it('show the budget notifications a lower warning threshold raises once it is saved', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const notifications = fakeBudgetNotificationsApi()
    const { user } = renderApp('/settings/profile')

    const threshold = await screen.findByRole('spinbutton', { name: 'Budget warning threshold (%)' })
    expect(await screen.findByRole('button', { name: 'Budget notifications' })).toBeInTheDocument()
    await user.clear(threshold)
    await user.type(threshold, '60')
    notifications.raise({
      id: 'n-1', month: '2026-11', categoryName: 'Transport', state: 'warning', budgeted: '1000000.00', spent: '700000.00', percentSpent: 70,
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Budget notifications, 1 unread' })).toBeInTheDocument()
    expect(api.profile.budgetWarningPercent).toBe(60)
  })

  it('email budget notifications until the user switches that off, and save it', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const email = await screen.findByRole('checkbox', { name: 'Email me budget notifications' })
    expect(email).toBeChecked()
    expect(email).toHaveAccessibleDescription('When a category’s spending reaches its warning threshold or goes over budget. They are always shown in the app.')

    await user.click(email)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your settings are saved.')
    expect(api.changes).toEqual([{ timeZone: 'Asia/Ho_Chi_Minh', locale: 'en', budgetWarningPercent: 80, emailBudgetNotifications: false, baseCurrency: 'VND' }])
    expect(api.profile.emailBudgetNotifications).toBe(false)
    expect(email).not.toBeChecked()
  })

  it.each(['0', '101', '12.5', ''])('refuse a budget warning threshold of "%s": it is a whole percentage from 1 to 100', async (percent) => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const threshold = await screen.findByRole('spinbutton', { name: 'Budget warning threshold (%)' })
    await user.clear(threshold)
    if (percent) await user.type(threshold, percent)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(threshold).toHaveAccessibleDescription(expect.stringContaining('Enter a whole percentage from 1 to 100.')))
    expect(threshold).toBeInvalid()
    expect(api.changes).toEqual([])
  })

  it('lock the base currency once the user has a budget, say why, and still save the other settings', async () => {
    const api = fakeProfileApi({ locale: 'en', baseCurrencyLocked: true })
    const { user } = renderApp('/settings/profile')

    const currency = await screen.findByRole('combobox', { name: 'Base currency' })
    expect(currency).toBeDisabled()
    expect(currency).toHaveDisplayValue('Vietnamese Dong (VND)')
    expect(currency).toHaveAccessibleDescription(expect.stringContaining('The base currency is locked because you have a budget'))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Time zone' }), 'Europe/Berlin')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your settings are saved.')
    expect(api.changes).toEqual([{ timeZone: 'Europe/Berlin', locale: 'en', budgetWarningPercent: 80, emailBudgetNotifications: true }])
    expect(api.profile).toMatchObject({ baseCurrency: 'VND', timeZone: 'Europe/Berlin' })
  })

  it('are not asked for again after a new base currency is saved: the answer to the save is the profile', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user, queryClient } = renderApp('/settings/profile')

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Base currency' }), 'EUR')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your settings are saved.')
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))
    expect(api.reads).toBe(1)
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

    renderApp('/reports')

    expect(await screen.findByRole('heading', { level: 1, name: 'Báo cáo' })).toBeInTheDocument()
  })

  it('a language picked in the sidebar is saved to the profile', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/reports')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const sidebar = nav.parentElement!
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Language' }), 'Tiếng Việt')

    await waitFor(() => expect(api.profile.locale).toBe('vi'))
    expect(screen.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeInTheDocument()
  })

  it('keep a language picked in the sidebar when the profile is saved afterwards', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const sidebar = (await screen.findByRole('navigation', { name: 'Main' })).parentElement!
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Language' }), 'vi')
    await waitFor(() => expect(api.profile.locale).toBe('vi'))

    const form = await screen.findByRole('form', { name: 'Hồ sơ' })
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Ngôn ngữ' })).toHaveValue('vi'))
    expect(screen.getByTestId('amount-example')).toHaveTextContent('1.234.568 ₫')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Tiền tệ cơ sở' }), 'USD')
    await user.click(within(form).getByRole('button', { name: 'Lưu' }))

    await waitFor(() => expect(api.profile.baseCurrency).toBe('USD'))
    expect(api.profile.locale).toBe('vi')
    expect(screen.getByRole('heading', { level: 1, name: 'Cài đặt' })).toBeInTheDocument()
  })

  it('keep a language picked in the sidebar after the form itself saved another', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const form = await screen.findByRole('form', { name: 'Profile' })
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Language' }), 'vi')
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu cài đặt của bạn.')

    const sidebar = screen.getByRole('navigation', { name: 'Điều hướng chính' }).parentElement!
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Ngôn ngữ' }), 'en')
    await waitFor(() => expect(api.profile.locale).toBe('en'))
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Language' })).toHaveValue('en'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.selectOptions(within(form).getByRole('combobox', { name: 'Base currency' }), 'USD')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.profile.baseCurrency).toBe('USD'))
    expect(api.profile.locale).toBe('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  })

  it('a language picked in the sidebar replaces one changed in the form and not yet saved', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')

    const form = await screen.findByRole('form', { name: 'Profile' })
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Base currency' }), 'EUR')
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Language' }), 'vi')
    const sidebar = screen.getByRole('navigation', { name: 'Main' }).parentElement!
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Language' }), 'vi')
    await waitFor(() => expect(api.profile.locale).toBe('vi'))
    await user.selectOptions(within(sidebar).getByRole('combobox', { name: 'Ngôn ngữ' }), 'en')
    await waitFor(() => expect(api.profile.locale).toBe('en'))

    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Language' })).toHaveValue('en'))
    expect(within(form).getByRole('combobox', { name: 'Base currency' })).toHaveValue('EUR')
  })

  it('name the setting the API refused, under its field', async () => {
    fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')
    server.use(http.patch(apiUrl('/api/v1/me'), () => problem(400, { errors: { baseCurrency: ['The base currency is locked.'] } })))

    const currency = await screen.findByRole('combobox', { name: 'Base currency' })
    await user.selectOptions(currency, 'USD')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(currency).toHaveAccessibleDescription(expect.stringContaining('This base currency cannot be chosen.')))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('say in a toast when the settings could not be saved, keep what the user chose, and save it when the user tries again', async () => {
    const api = fakeProfileApi({ locale: 'en' })
    const { user } = renderApp('/settings/profile')
    server.use(http.patch(apiUrl('/api/v1/me'), () => problem(500), { once: true }))

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Base currency' }), 'USD')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Your settings could not be saved. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Base currency' })).toHaveValue('USD')
    expect(api.profile.baseCurrency).not.toBe('USD')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.profile.baseCurrency).toBe('USD'))
    expect(screen.queryByText('Your settings could not be saved. Try again.')).not.toBeInTheDocument()
  })
})
