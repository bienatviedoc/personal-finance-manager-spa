import { http, HttpResponse } from 'msw'
import { apiUrl as url, problem } from './server'
import { server } from './server'

/**
 * A stand-in for the monthly summary (`/api/v1/reports/monthly-summary.pdf`), following the same rules as the
 * real API (see the API's MonthlySummaryTests): a month written `2026-11` is required, a locale is `en` or `vi`,
 * and the file is named after the month. Returns every query it was asked with, in the order they arrived.
 */
export function fakeMonthlySummaryApi() {
  const asked: Record<string, string>[] = []

  server.use(
    http.get(url('/api/v1/reports/monthly-summary.pdf'), ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams)
      asked.push(query)
      const month = query.month ?? ''
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return problem(400, { errors: { month: ['Enter a month as YYYY-MM.'] } })
      if (query.locale !== undefined && !['en', 'vi'].includes(query.locale)) return problem(400, { errors: { locale: ['Choose one of: en, vi.'] } })
      const name = `monthly-summary-${month}.pdf`
      // Not a real PDF: the app hands the file over as it came, and never looks inside.
      return new HttpResponse(new TextEncoder().encode(`%PDF-test ${month} ${query.locale ?? ''}`), {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=${name}; filename*=UTF-8''${name}` },
      })
    }),
  )

  return asked
}
