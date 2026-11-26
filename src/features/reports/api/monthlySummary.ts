import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { CalendarMonth } from '@/shared/dates'
import type { Language } from '@/shared/i18n'
import { fileNameOf, saveFile } from '@/shared/lib/saveFile'

/**
 * Downloads the monthly summary (spec section 7, export): one month's income, expenses, net and savings rate,
 * spending by category and budgets as a PDF, written by the API in the language asked for and saved under the
 * name it gives the file.
 */
export function useDownloadMonthlySummary() {
  return useMutation({
    mutationFn: async ({ month, locale }: { month: CalendarMonth; locale: Language }) => {
      const { data, response } = await api.GET('/api/v1/reports/monthly-summary.pdf', { params: { query: { month, locale } }, parseAs: 'blob' })
      if (!response.ok || !data) throw new Error(`Could not download the monthly summary: ${response.status}`)
      saveFile(data, fileNameOf(response) ?? `monthly-summary-${month}.pdf`)
    },
  })
}
