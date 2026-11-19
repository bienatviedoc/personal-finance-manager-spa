import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { antiforgeryToken, apiUrl, server, testUser } from '@/test/server'
import { api } from './client'

// W3C Trace Context: version 00, a 32-hex trace id, a 16-hex parent span id, sampled.
const traceparent = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-01$/

describe('the API client', () => {
  it('starts a new trace for every request, which the API and the database calls it makes join', async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get(apiUrl('/api/v1/auth/antiforgery'), ({ request }) => {
        seen.push(request.headers.get('traceparent'))
        return HttpResponse.json({ token: antiforgeryToken })
      }),
      http.get(apiUrl('/api/v1/me'), ({ request }) => {
        seen.push(request.headers.get('traceparent'))
        return HttpResponse.json(testUser)
      }),
      http.post(apiUrl('/api/v1/auth/logout'), ({ request }) => {
        seen.push(request.headers.get('traceparent'))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await api.GET('/api/v1/me')
    await api.POST('/api/v1/auth/logout')

    expect(seen).toHaveLength(3)
    for (const header of seen) expect(header).toMatch(traceparent)
    const traceIds = seen.map((header) => header?.split('-')[1])
    expect(new Set(traceIds).size).toBe(3)
  })
})
