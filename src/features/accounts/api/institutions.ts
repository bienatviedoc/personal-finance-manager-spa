import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type Institution = components['schemas']['InstitutionResponse']
export type InstitutionFields = components['schemas']['InstitutionRequest']

/** Fields the API can refuse, which the form shows its own translated message for. */
export type InstitutionField = 'name' | 'color' | 'logoKey'

export type SaveOutcome = { saved: true; institution: Institution } | { saved: false; fields: InstitutionField[] }

const institutionsKey = ['institutions']
const institutionFields: InstitutionField[] = ['name', 'color', 'logoKey']

/**
 * The user's institutions by name, without archived ones: what lists and pickers show. A user has dozens,
 * so every page is loaded.
 */
export const institutionsQuery = queryOptions({
  queryKey: [...institutionsKey, { includeArchived: false }],
  queryFn: async () => {
    const institutions: Institution[] = []
    let cursor: string | undefined
    do {
      const { data, response } = await api.GET('/api/v1/institutions', { params: { query: { cursor } } })
      if (!data) throw new Error(`Could not load institutions: ${response.status}`)
      institutions.push(...data.items)
      cursor = data.nextCursor ?? undefined
    } while (cursor)
    return institutions
  },
})

export function useCreateInstitution() {
  return useSaveInstitution(async (fields: InstitutionFields) => api.POST('/api/v1/institutions', { body: fields }))
}

export function useEditInstitution(id: string) {
  return useSaveInstitution(async (fields: InstitutionFields) =>
    api.PUT('/api/v1/institutions/{id}', { params: { path: { id } }, body: fields }),
  )
}

/** Archives the institution: what deleting one does. It leaves the list and pickers. */
export function useArchiveInstitution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/institutions/{id}', { params: { path: { id } } })
      if (!response.ok) throw new Error(`Archiving an institution failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institutionsKey }),
  })
}

type SaveResponse = { data?: Institution; error?: unknown; response: Response }

function useSaveInstitution(save: (fields: InstitutionFields) => Promise<SaveResponse>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fields: InstitutionFields): Promise<SaveOutcome> => {
      const { data, error, response } = await save(fields)
      if (data) return { saved: true, institution: data }
      const refused = refusedFields(response, error, institutionFields)
      if (refused) return { saved: false, fields: refused }
      throw new Error(`Saving an institution failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) return queryClient.invalidateQueries({ queryKey: institutionsKey })
    },
  })
}
