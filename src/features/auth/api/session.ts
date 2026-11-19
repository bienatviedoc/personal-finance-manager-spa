import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { redirect, type LoaderFunctionArgs } from 'react-router'
import { api } from '@/shared/api/client'

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
