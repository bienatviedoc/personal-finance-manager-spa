import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startErrorReporting } from '@/shared/observability/errorReporting'
import { traceIdOf, traceparentHeader } from '@/shared/observability/traceparent'
import { failingScreen, renderApp } from '@/test/renderApp'
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

  /** The one report sent once the screen has failed. */
  async function reportOfTheFailedScreen() {
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    return theOneReport()
  }

  async function theOneReport() {
    await waitFor(() => expect(tracker.reports).toHaveLength(1))
    return tracker.reports[0]!
  }

  function expectNoneOf(report: Record<string, unknown>, leaks: string[]) {
    for (const leaked of leaks) expect(JSON.stringify(report)).not.toContain(leaked)
  }

  it('report a screen that fails once, without the address query or what was logged before', async () => {
    window.history.replaceState(null, '', '/failing?payee=Corner+Bakery&amount=4815.16')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    console.log('Paid Corner Bakery 4815.16')

    renderApp('/failing?payee=Corner+Bakery&amount=4815.16', { extraScreens: [failingScreen] })

    const report = await reportOfTheFailedScreen()
    expect(JSON.stringify(report)).toContain('render failed')
    expect(report).toMatchObject({ request: { url: `${window.location.origin}/failing` } })
    expectNoneOf(report, ['Corner', 'Bakery', '4815', testUser.email])
  })

  it.each([
    ['an object', { payee: 'Corner Bakery', amount: 4815.16 }],
    ['a string', 'Paid Corner Bakery 4815.16'],
  ])('leave out what a screen threw when it is %s, not an Error, since it may hold anything', async (_, thrown) => {
    renderApp('/failing', {
      extraScreens: [
        {
          path: 'failing',
          loader: () => {
            throw thrown
          },
          Component: () => null,
        },
      ],
    })

    expectNoneOf(await reportOfTheFailedScreen(), ['Corner', 'Bakery', '4815', 'payee', 'amount'])
  })

  it('report an error outside any screen', async () => {
    // With no listener of the test's own, Vitest takes a window error for a failure of the test.
    const expected = () => {}
    window.addEventListener('error', expected)

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('outside any screen') }))
    window.removeEventListener('error', expected)

    expect(JSON.stringify(await theOneReport())).toContain('outside any screen')
  })

  it('report a promise rejected with something that is not an Error, without its value', async () => {
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'Paid Corner Bakery 4815.16' }))

    expectNoneOf(await theOneReport(), ['Corner', 'Bakery', '4815'])
  })

  it('name the trace of an API call the server failed before the error, so the API side can be found', async () => {
    let sentTraceparent: string | null = null
    server.use(
      http.get(apiUrl('/api/v1/me'), ({ request }) => {
        sentTraceparent = request.headers.get(traceparentHeader)
        return problem(500)
      }),
    )

    renderApp('/budgets')

    const report = await reportOfTheFailedScreen()
    const traceId = traceIdOf(sentTraceparent)
    expect(traceId).toBeTruthy()
    expect(report).toMatchObject({
      breadcrumbs: [expect.objectContaining({ category: 'api', data: { method: 'GET', path: '/api/v1/me', status: 500, trace_id: traceId } })],
    })
  })

  it('name the trace of an API call that got no response before the error', async () => {
    let sentTraceparent: string | null = null
    server.use(
      http.get(apiUrl('/api/v1/me'), ({ request }) => {
        sentTraceparent = request.headers.get(traceparentHeader)
        return HttpResponse.error()
      }),
    )

    renderApp('/budgets')

    const report = await reportOfTheFailedScreen()
    expect(report).toMatchObject({
      breadcrumbs: [expect.objectContaining({ category: 'api', data: { method: 'GET', path: '/api/v1/me', trace_id: traceIdOf(sentTraceparent) } })],
    })
  })
})
