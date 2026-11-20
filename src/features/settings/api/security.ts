import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, forgetAntiforgeryToken } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type TwoFactorSetup = components['schemas']['TwoFactorSetupResponse']

/** Whether the signed-in user signs in with two factors, and how many recovery codes they have left. */
export const twoFactorQuery = queryOptions({
  queryKey: ['me', 'two-factor'],
  queryFn: async () => {
    const { data, response } = await api.GET('/api/v1/me/two-factor')
    if (!data) throw new Error(`Could not load two-factor sign-in: ${response.status}`)
    return data
  },
})

export type ChangePasswordOutcome = { saved: true } | { saved: false; fields: ('currentPassword' | 'newPassword')[] }

/** Changes the signed-in user's password. Their other sessions end; this one carries on. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: components['schemas']['ChangePasswordRequest']): Promise<ChangePasswordOutcome> => {
      const { response, error } = await api.POST('/api/v1/me/password', { body })
      if (response.ok) return sessionRenewed({ saved: true })
      const fields = refusedFields(response, error, ['currentPassword', 'newPassword'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not change the password: ${response.status}`)
    },
  })
}

/** Asks for the key to add to an authenticator app. Nothing changes for signing in until a code confirms it. */
export function useSetUpTwoFactor() {
  return useMutation({
    mutationFn: async (): Promise<TwoFactorSetup> => {
      const { data, response } = await api.POST('/api/v1/me/two-factor/setup')
      if (!data) throw new Error(`Could not set up two-factor sign-in: ${response.status}`)
      return data
    },
  })
}

export type TurnOnTwoFactorOutcome = { saved: true; recoveryCodes: string[] } | { saved: false; fields: 'code'[] }

/** Turns two-factor sign-in on with a code from the authenticator app, and answers the recovery codes, shown once. */
export function useTurnOnTwoFactor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (code: string): Promise<TurnOnTwoFactorOutcome> => {
      const { data, response, error } = await api.POST('/api/v1/me/two-factor/enable', { body: { code } })
      if (data) return sessionRenewed({ saved: true, recoveryCodes: data.recoveryCodes })
      const fields = refusedFields(response, error, ['code'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not turn on two-factor sign-in: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorQuery.queryKey }),
  })
}

export type PasswordConfirmedOutcome = { saved: true } | { saved: false; fields: 'password'[] }

/** Turns two-factor sign-in off, given the user's password. */
export function useTurnOffTwoFactor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (password: string): Promise<PasswordConfirmedOutcome> => {
      const { response, error } = await api.POST('/api/v1/me/two-factor/disable', { body: { password } })
      if (response.ok) return sessionRenewed({ saved: true })
      const fields = refusedFields(response, error, ['password'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not turn off two-factor sign-in: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorQuery.queryKey }),
  })
}

export type NewRecoveryCodesOutcome = { saved: true; recoveryCodes: string[] } | { saved: false; fields: 'password'[] }

/** Replaces the user's recovery codes, given their password. The old ones stop working. */
export function useNewRecoveryCodes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (password: string): Promise<NewRecoveryCodesOutcome> => {
      const { data, response, error } = await api.POST('/api/v1/me/two-factor/recovery-codes', { body: { password } })
      if (data) return { saved: true, recoveryCodes: data.recoveryCodes }
      const fields = refusedFields(response, error, ['password'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not make new recovery codes: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: twoFactorQuery.queryKey }),
  })
}

/**
 * These changes end the user's sessions and issue this one's cookie again, so the anti-forgery token that went
 * with the old cookie is dropped rather than trusted to still match.
 */
function sessionRenewed<Outcome>(outcome: Outcome): Outcome {
  forgetAntiforgeryToken()
  return outcome
}
