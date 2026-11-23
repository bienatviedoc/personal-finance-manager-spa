import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type Category = components['schemas']['CategoryResponse']
export type CategoryKind = components['schemas']['CategoryKind']
/** Both kinds, in the order screens show them. */
export const categoryKinds = ['expense', 'income'] as const satisfies readonly CategoryKind[]
export type CategoryFields = components['schemas']['CategoryChangeRequest']

/**
 * The kind of category income or an expense takes, which is also which of the two it is: what a form that records
 * one, or a recurring rule, starts its type toggle on. A leg of a transfer takes no category and opens no such form.
 */
export const kindTakenBy = (type: components['schemas']['TransactionType']): CategoryKind => (type === 'income' ? 'income' : 'expense')

/** Fields the API can refuse, which the form shows its own translated message for. */
const categoryFields = ['name', 'kind', 'icon', 'color', 'parentId'] as const
export type CategoryField = (typeof categoryFields)[number]

export type SaveOutcome = { saved: true; category: Category } | { saved: false; fields: CategoryField[] }

const categoriesKey = ['categories']

/** The user's category tree. Archived categories are left out unless asked for, as pickers need. */
export const categoriesQuery = ({ includeArchived = false }: { includeArchived?: boolean } = {}) =>
  queryOptions({
    queryKey: [...categoriesKey, { includeArchived }],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/categories', { params: { query: { includeArchived } } })
      if (!data) throw new Error(`Could not load categories: ${response.status}`)
      return data.items
    },
  })

/** Adds a top-level category, or a subcategory when `parentId` is set. */
export function useCreateCategory() {
  return useSaveCategory(async (body: CategoryFields & { parentId: string | null }) => api.POST('/api/v1/categories', { body }))
}

/** Renames, recolours or re-icons a category, or changes its kind. */
export function useEditCategory() {
  return useSaveCategory(async ({ id, ...body }: CategoryFields & { id: string }) =>
    api.PUT('/api/v1/categories/{id}', { params: { path: { id } }, body }),
  )
}

/** Archives a category and its subcategories: what deleting one does. They leave pickers. */
export function useArchiveCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/categories/{id}', { params: { path: { id } } })
      if (!response.ok) throw new Error(`Archiving a category failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey }),
  })
}

type SaveResponse = { data?: Category; error?: unknown; response: Response }

function useSaveCategory<Variables>(save: (variables: Variables) => Promise<SaveResponse>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variables: Variables): Promise<SaveOutcome> => {
      const { data, error, response } = await save(variables)
      if (data) return { saved: true, category: data }
      const fields = refusedFields(response, error, categoryFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Saving a category failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) return queryClient.invalidateQueries({ queryKey: categoriesKey })
    },
  })
}
