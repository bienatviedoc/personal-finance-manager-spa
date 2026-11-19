import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, forgetAntiforgeryToken } from '@/shared/api/client'
import { signedInUserQuery } from './session'

export type SignInOutcome = 'signed-in' | 'wrong-credentials' | 'email-not-verified'

const emailNotVerified = 'urn:pfm:problem:email-not-verified'

export function useSignIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { email: string; password: string }): Promise<SignInOutcome> => {
      const { response, error } = await api.POST('/api/v1/auth/login', { body })
      if (response.ok) {
        forgetAntiforgeryToken()
        // Fetched now, not just marked stale: the router's loaders read this cache on the next navigation.
        await queryClient.fetchQuery({ ...signedInUserQuery, staleTime: 0 })
        return 'signed-in'
      }
      if (response.status === 401) return 'wrong-credentials'
      if (response.status === 403 && error?.type === emailNotVerified) return 'email-not-verified'
      throw new Error(`Sign-in failed: ${response.status}`)
    },
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { response } = await api.POST('/api/v1/auth/resend-verification', { body: { email } })
      if (!response.ok) throw new Error(`Could not resend the link: ${response.status}`)
    },
  })
}
