import { useMutation, useQueryClient } from '@tanstack/react-query'
import { forgetSignedInUser } from '@/features/auth'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import { fileNameOf, saveFile } from '@/shared/lib/saveFile'

/**
 * Downloads everything the app holds about the signed-in user: a ZIP file with their profile as JSON and a CSV
 * file for each kind of data, saved under the name the API gives it.
 */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const { data, response } = await api.GET('/api/v1/export/all.zip', { parseAs: 'blob' })
      if (!response.ok || !data) throw new Error(`Could not export the data: ${response.status}`)
      saveFile(data, fileNameOf(response) ?? 'personal-finance-manager.zip')
    },
  })
}

export type DeleteUserOutcome = { saved: true } | { saved: false; fields: 'password'[] }

/**
 * Deletes the signed-in user, given their password. The API signs them out everywhere at once and deactivates
 * them; nothing is erased for 30 days, and signing in again before then cancels it. Here nothing of the user
 * is kept either: they are signed out of the app as if they had asked to be.
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (password: string): Promise<DeleteUserOutcome> => {
      const { response, error } = await api.POST('/api/v1/me/deletion', { body: { password } })
      if (response.ok) return { saved: true }
      const fields = refusedFields(response, error, ['password'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Could not delete the user: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) forgetSignedInUser(queryClient)
    },
  })
}
