import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl as url, problem, server } from './server'

type AuditEntryResponse = components['schemas']['AuditEntryResponse']
type AuditLogResponse = components['schemas']['AuditLogResponse']

/**
 * A stand-in for the user's audit log (`GET /api/v1/me/audit-log`), following the same rules as the real API (see the
 * API's AuditLogTests): the newest first, a page at a time (50 unless `limit` says otherwise), read only. Pass the
 * entries newest first. `fail` makes every answer a server error.
 */
export function fakeAuditLogApi(entries: AuditEntryResponse[] = []) {
  const state = { entries, fail: false, reads: 0 }

  server.use(
    http.get(url('/api/v1/me/audit-log'), ({ request }) => {
      state.reads += 1
      if (state.fail) return problem(500)
      const query = new URL(request.url).searchParams
      const limit = Number(query.get('limit') ?? 50)
      const cursor = query.get('cursor')
      const start = cursor === null ? 0 : state.entries.findIndex((entry) => entry.id === cursor) + 1
      const page = state.entries.slice(start, start + limit)
      const more = start + limit < state.entries.length
      return HttpResponse.json({ items: page, nextCursor: more ? page[page.length - 1]!.id : null } satisfies AuditLogResponse)
    }),
  )

  return state
}

/** An audit entry, with what a test does not care about filled in. */
export function auditEntry(entry: Partial<AuditEntryResponse> & Pick<AuditEntryResponse, 'id'>): AuditEntryResponse {
  return { action: 'signIn', entityType: 'user', entityId: null, at: '2026-11-20T08:00:00Z', summary: 'Signed in with a password.', ...entry }
}
