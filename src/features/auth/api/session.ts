import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { api, forgetAntiforgeryToken } from '@/shared/api/client'

/** The signed-in user, or null when nobody is signed in. */
export const signedInUserQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => {
    const { data, response } = await api.GET('/api/v1/me')
    if (response.status === 401) return null
    if (!data) throw new Error(`Could not load the signed-in user: ${response.status}`)
    return data
  },
})

/**
 * For when the session has ended on purpose (signing out, or deleting the user): nothing of the user may
 * linger in the cache, and the anti-forgery token that went with their session is dropped.
 */
export function forgetSignedInUser(queryClient: QueryClient) {
  forgetAntiforgeryToken()
  queryClient.clear()
  queryClient.setQueryData(signedInUserQuery.queryKey, null)
}

/**
 * A loader for screens that need a signed-in user. Anyone else is sent to sign in, which brings
 * them back here afterwards.
 */
export function requireSignedInUser(queryClient: QueryClient) {
  return async ({ request }: LoaderFunctionArgs) => {
    const user = await queryClient.ensureQueryData(signedInUserQuery)
    if (user) return null

    const { pathname, search } = new URL(request.url)
    const returnTo = pathname === '/' && !search ? '' : `?returnTo=${encodeURIComponent(pathname + search)}`
    throw redirect(`/login${returnTo}`)
  }
}
