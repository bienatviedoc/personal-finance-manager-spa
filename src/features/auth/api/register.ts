import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/shared/api/client'
import { supportedLanguages, type Language } from '@/shared/i18n'

export type RegisterOutcome = { registered: true } | { registered: false; fields: ('email' | 'password')[] }

/** Registers in the language the app is shown in, so the new user's default categories come in it. */
export function useRegister() {
  const { i18n } = useTranslation()
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }): Promise<RegisterOutcome> => {
      const language = supportedLanguages.find((supported) => supported === i18n.resolvedLanguage) satisfies Language | undefined
      const { response, error } = await api.POST('/api/v1/auth/register', { body: { ...credentials, language } })
      if (response.ok) return { registered: true }
      if (response.status === 400 && error?.errors) {
        // The API's messages are English; the screen shows its own, translated, for each field.
        const fields = Object.keys(error.errors).filter((field) => field === 'email' || field === 'password')
        if (fields.length > 0) return { registered: false, fields }
      }
      throw new Error(`Registering failed: ${response.status}`)
    },
  })
}
