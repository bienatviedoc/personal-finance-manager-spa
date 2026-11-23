import { queryOptions } from '@tanstack/react-query'

/**
 * What the sign-in screen is told, as the router's location state, when the visitor has just deleted their
 * user: they are signed out, and it says how to cancel.
 */
export const deletionRequested = { deletionRequested: true } as const

export function isDeletionRequested(state: unknown) {
  return typeof state === 'object' && state !== null && 'deletionRequested' in state
}

/**
 * Whether signing in has just cancelled the deletion the user had asked for. Never fetched: signing in sets
 * it from the API's answer, and it stays until the user dismisses the notice or signs out. Kept in the query
 * cache so it survives the redirects between the sign-in screen and wherever the user lands.
 */
export const deletionCancelledQuery = queryOptions({
  queryKey: ['auth', 'deletion-cancelled'],
  queryFn: () => false,
  staleTime: Infinity,
  gcTime: Infinity,
})
