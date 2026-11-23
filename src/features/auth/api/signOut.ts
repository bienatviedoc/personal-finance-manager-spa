import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { forgetSignedInUser } from './session'

export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { response } = await api.POST('/api/v1/auth/logout')
      // 401 means the session had already ended: the outcome the viewer wanted.
      if (!response.ok && response.status !== 401) throw new Error(`Signing out failed: ${response.status}`)
    },
    onSuccess: () => forgetSignedInUser(queryClient),
  })
}
