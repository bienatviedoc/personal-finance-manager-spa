import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import { supportedLanguages, type Language } from '@/shared/i18n'

export type RegisterOutcome = { saved: true } | { saved: false; fields: ('email' | 'password')[] }

/**
 * Registers in the language the app is shown in: it becomes the new user's locale, and their default
 * categories come in it.
 */
export function useRegister() {
  const { i18n } = useTranslation()
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }): Promise<RegisterOutcome> => {
      const locale = supportedLanguages.find((supported) => supported === i18n.resolvedLanguage) satisfies Language | undefined
      const { response, error } = await api.POST('/api/v1/auth/register', { body: { ...credentials, locale } })
      if (response.ok) return { saved: true }
      const fields = refusedFields(response, error, ['email', 'password'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Registering failed: ${response.status}`)
    },
  })
}
