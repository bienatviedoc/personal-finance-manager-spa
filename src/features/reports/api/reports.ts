import type { QueryClient } from '@tanstack/react-query'

/** What every report's query key starts with, so they can be loaded again together. */
export const reportsKey = ['reports']

/**
 * Loads every report again, for a change made elsewhere that moves what they show: recording, editing or
 * deleting a transaction or a transfer.
 */
export function refreshReports(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: reportsKey })
}
