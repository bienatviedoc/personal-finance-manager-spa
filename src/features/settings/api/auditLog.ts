import { infiniteQueryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type AuditEntry = components['schemas']['AuditEntryResponse']
export type AuditAction = components['schemas']['AuditAction']
export type AuditEntityType = components['schemas']['AuditEntityType']

/**
 * The signed-in user's audit log, the newest entry first, a page at a time. The API writes every entry, in the same
 * save as what it records, and nothing can change or remove one, so there is nothing here but reading.
 */
export const auditLogQuery = infiniteQueryOptions({
  queryKey: ['me', 'audit-log'],
  queryFn: async ({ pageParam }) => {
    const { data, response } = await api.GET('/api/v1/me/audit-log', { params: { query: pageParam ? { cursor: pageParam } : {} } })
    if (!data) throw new Error(`Could not load the audit log: ${response.status}`)
    return data
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page) => page.nextCursor ?? undefined,
  // Each action the user takes elsewhere adds an entry: read it afresh whenever the screen opens.
  staleTime: 0,
})
