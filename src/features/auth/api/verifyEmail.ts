import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'

/**
 * Confirms the email address from the link's user id and token. A query rather than a mutation,
 * keyed by the link, so it runs once per link however often the screen renders.
 */
export function useVerifyEmail(userId: string, token: string) {
  return useQuery({
    queryKey: ['verify-email', userId, token],
    queryFn: async () => {
      const { response } = await api.POST('/api/v1/auth/verify-email', { body: { userId, token } })
      return response.ok
    },
    enabled: Boolean(userId && token),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}
