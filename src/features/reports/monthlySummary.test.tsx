import { screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAccountsApi } from '@/test/fakeAccountsApi'
import { fakeCategoriesApi } from '@/test/fakeCategoriesApi'
import { fakeMonthlySummaryApi } from '@/test/fakeMonthlySummaryApi'
import { fakeReportsApi } from '@/test/fakeReportsApi'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server } from '@/test/server'

describe('the monthly summary', () => {
  /** What the browser was handed to save: jsdom has no downloads, so the link the app clicks is caught here. */
  const saved: { name: string; file: Blob | undefined }[] = []
  const files = new Map<string, Blob>()

  beforeEach(() => {
    // Only the date is fixed, so it is this month in the user's time zone (Asia/Ho_Chi_Minh); timers run as usual.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T03:00:00Z'))
    saved.length = 0
    files.clear()
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (file: Blob) => {
        const address = `blob:test/${files.size}`
        files.set(address, file)
        return address
      },
      revokeObjectURL: () => undefined,
    }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, file: files.get(this.href) })
    })
    fakeCategoriesApi()
    fakeAccountsApi()
    fakeReportsApi()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const summarySection = async () => within(await screen.findByRole('region', { name: 'Monthly summary' }))

  it('downloads this month as a PDF in the language of the interface, saved under the name the API gave it', async () => {
    const asked = fakeMonthlySummaryApi()
    const { user } = renderApp('/reports/spending-by-category')
    const section = await summarySection()

    expect(section.getByRole('combobox', { name: 'Month' })).toHaveDisplayValue('November 2026')
    await user.click(section.getByRole('button', { name: 'Download PDF' }))

    expect(await section.findByRole('status')).toHaveTextContent('The monthly summary is downloaded.')
    expect(asked).toEqual([{ month: '2026-11', locale: 'en' }])
    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe('monthly-summary-2026-11.pdf')
    expect(await saved[0]?.file?.text()).toBe('%PDF-test 2026-11 en')
  })

  it('downloads an earlier month the user chooses', async () => {
    const asked = fakeMonthlySummaryApi()
    const { user } = renderApp('/reports/income-vs-expenses')
    const section = await summarySection()

    await user.selectOptions(section.getByRole('combobox', { name: 'Month' }), 'March 2026')
    await user.click(section.getByRole('button', { name: 'Download PDF' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(asked).toEqual([{ month: '2026-03', locale: 'en' }])
    expect(saved[0]?.name).toBe('monthly-summary-2026-03.pdf')
  })

  it('is written in Vietnamese when the interface is', async () => {
    const asked = fakeMonthlySummaryApi()
    const { user } = renderApp('/reports/spending-by-category', { language: 'vi' })
    const section = within(await screen.findByRole('region', { name: 'Tổng kết tháng' }))

    expect(section.getByRole('combobox', { name: 'Tháng' })).toHaveDisplayValue('tháng 11 năm 2026')
    await user.click(section.getByRole('button', { name: 'Tải PDF' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(asked).toEqual([{ month: '2026-11', locale: 'vi' }])
  })

  it('says in a toast when the download fails, and downloads it when the user tries again', async () => {
    fakeMonthlySummaryApi()
    server.use(http.get(apiUrl('/api/v1/reports/monthly-summary.pdf'), () => problem(500), { once: true }))
    const { user } = renderApp('/reports/spending-by-category')
    const section = await summarySection()

    await user.click(section.getByRole('button', { name: 'Download PDF' }))

    expect(await screen.findByText('The monthly summary could not be downloaded.')).toBeInTheDocument()
    expect(saved).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]?.name).toBe('monthly-summary-2026-11.pdf')
  })
})
