import { screen, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startErrorReporting } from '@/shared/observability/errorReporting'
import { traceIdOf } from '@/shared/observability/traceparent'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server, testUser } from '@/test/server'

type Envelope = [Record<string, unknown>, [{ type: string }, Record<string, unknown>][]]

/** An error tracker that keeps the reports it is sent, standing in for Sentry. */
function fakeErrorTracker() {
  const reports: Record<string, unknown>[] = []
  const transport = () => ({
    send: async (envelope: unknown) => {
      for (const [header, payload] of (envelope as Envelope)[1]) {
        if (header.type === 'event') reports.push(payload)
      }
      return {}
    },
    flush: async () => true,
  })
  return { reports, transport }
}

describe('error reports', () => {
  let tracker: ReturnType<typeof fakeErrorTracker>
  let stop: () => Promise<void>

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    tracker = fakeErrorTracker()
    stop = startErrorReporting({ dsn: 'https://publickey@errors.test/1', environment: 'test', transport: tracker.transport })
  })

  afterEach(async () => {
    await stop()
    window.history.replaceState(null, '', '/')
  })

  function FailingScreen(): never {
    throw new Error('render failed')
  }

  it('report a screen that fails once, without the address query or what was logged before', async () => {
    window.history.replaceState(null, '', '/failing?payee=Corner+Bakery&amount=4815.16')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    console.log('Paid Corner Bakery 4815.16')

    renderApp('/failing?payee=Corner+Bakery&amount=4815.16', { extraScreens: [{ path: 'failing', Component: FailingScreen }] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    await waitFor(() => expect(tracker.reports).toHaveLength(1))
    const [report] = tracker.reports
    expect(JSON.stringify(report)).toContain('render failed')
    expect(report).toMatchObject({ request: { url: `${window.location.origin}/failing` } })
    for (const leaked of ['Corner', 'Bakery', '4815', testUser.email]) {
      expect(JSON.stringify(report)).not.toContain(leaked)
    }
  })

  it('leave out what a screen threw when it is not an Error, since it may hold anything', async () => {
    renderApp('/failing', {
      extraScreens: [
        {
          path: 'failing',
          loader: () => {
            throw { payee: 'Corner Bakery', amount: 4815.16 }
          },
          Component: () => null,
        },
      ],
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    await waitFor(() => expect(tracker.reports).toHaveLength(1))
    for (const leaked of ['Corner', 'Bakery', '4815']) {
      expect(JSON.stringify(tracker.reports[0])).not.toContain(leaked)
    }
  })

  it('name the trace of an API call that failed before the error, so the API side can be found', async () => {
    let sentTraceparent: string | null = null
    server.use(
      http.get(apiUrl('/api/v1/me'), ({ request }) => {
        sentTraceparent = request.headers.get('traceparent')
        return problem(500)
      }),
    )

    renderApp('/budgets')

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    await waitFor(() => expect(tracker.reports).toHaveLength(1))
    const traceId = traceIdOf(sentTraceparent)
    expect(traceId).toBeTruthy()
    expect(tracker.reports[0]).toMatchObject({
      breadcrumbs: [expect.objectContaining({ category: 'api', data: { method: 'GET', path: '/api/v1/me', status: 500, trace_id: traceId } })],
    })
  })
})
