import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, forgetAntiforgeryToken } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { signedInUserQuery } from './session'

export type SignInOutcome =
  | 'signed-in'
  | 'wrong-credentials'
  | 'email-not-verified'
  /** The password is right; the user signs in with two factors, so the same request is sent again with a code. */
  | 'two-factor-required'
  | 'two-factor-code-incorrect'
  /** This client has used up its attempts for now (the API's rate limit). */
  | 'too-many-attempts'

const emailNotVerified = 'urn:pfm:problem:email-not-verified'
const twoFactorRequired = 'urn:pfm:problem:two-factor-required'
const twoFactorCodeIncorrect = 'urn:pfm:problem:two-factor-code-incorrect'

export function useSignIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: components['schemas']['SignInRequest']): Promise<SignInOutcome> => {
      const { response, error } = await api.POST('/api/v1/auth/login', { body })
      if (response.ok) {
        forgetAntiforgeryToken()
        // Fetched now, not just marked stale: the router's loaders read this cache on the next navigation.
        await queryClient.fetchQuery({ ...signedInUserQuery, staleTime: 0 })
        return 'signed-in'
      }
      if (response.status === 401 && error?.type === twoFactorRequired) return 'two-factor-required'
      if (response.status === 401 && error?.type === twoFactorCodeIncorrect) return 'two-factor-code-incorrect'
      if (response.status === 401) return 'wrong-credentials'
      if (response.status === 403 && error?.type === emailNotVerified) return 'email-not-verified'
      if (response.status === 429) return 'too-many-attempts'
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
