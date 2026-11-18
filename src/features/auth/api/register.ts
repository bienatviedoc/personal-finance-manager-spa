import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api/client'

export type RegisterOutcome = { registered: true } | { registered: false; fields: ('email' | 'password')[] }

export function useRegister() {
  return useMutation({
    mutationFn: async (body: { email: string; password: string }): Promise<RegisterOutcome> => {
      const { response, error } = await api.POST('/api/v1/auth/register', { body })
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
