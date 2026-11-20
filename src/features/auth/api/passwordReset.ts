import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { response } = await api.POST('/api/v1/auth/forgot-password', { body: { email } })
      if (!response.ok) throw new Error(`Could not ask for a reset link: ${response.status}`)
    },
  })
}

/**
 * Resetting a password can fail in a way no field explains, a link that is used up or expired, so it names
 * its outcomes instead of answering `{ saved }`.
 */
export type ResetPasswordOutcome = 'password-changed' | 'link-invalid' | 'password-refused'

const resetLinkInvalid = 'urn:pfm:problem:reset-link-invalid'

export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: { userId: string; token: string; password: string }): Promise<ResetPasswordOutcome> => {
      const { response, error } = await api.POST('/api/v1/auth/reset-password', { body })
      if (response.ok) return 'password-changed'
      if (response.status === 400 && error?.type === resetLinkInvalid) return 'link-invalid'
      // The API's messages are English; the screen shows its own, translated.
      if (refusedFields(response, error, ['password'])) return 'password-refused'
      // A user id that is not a UUID never reaches the use case: the link is as good as tampered with.
      if (response.status === 400) return 'link-invalid'
      throw new Error(`Resetting the password failed: ${response.status}`)
    },
  })
}
