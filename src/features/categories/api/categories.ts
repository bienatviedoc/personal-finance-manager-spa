import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type Category = components['schemas']['CategoryResponse']
export type CategoryKind = components['schemas']['CategoryKind']
export type CategoryFields = { name: string; kind: CategoryKind; icon: string; color: string }

/** A request field the API refused, by the name it gave it. */
export type CategoryField = 'name' | 'kind' | 'icon' | 'color' | 'parentId'
export type SaveOutcome = { saved: true } | { saved: false; fields: CategoryField[] }

const categoriesKey = ['categories'] as const

/** The user's category tree. Archived categories are left out unless asked for, as pickers need. */
export function useCategories({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: [...categoriesKey, { includeArchived }],
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/categories', { params: { query: { includeArchived } } })
      if (!data) throw new Error(`Loading categories failed: ${response.status}`)
      return data.items
    },
  })
}

const knownFields: CategoryField[] = ['name', 'kind', 'icon', 'color', 'parentId']

/** A 400 naming fields becomes an outcome the form shows; anything else is an error. */
function outcomeOf(action: string, response: Response, error: unknown): SaveOutcome {
  if (response.ok) return { saved: true }
  const errors = (error as { errors?: Record<string, string[]> } | undefined)?.errors
  if (response.status === 400 && errors) {
    const fields = knownFields.filter((field) => field in errors)
    if (fields.length > 0) return { saved: false, fields }
  }
  throw new Error(`${action} failed: ${response.status}`)
}

function useCategoryMutation<T>(save: (variables: T) => Promise<SaveOutcome>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: save,
    onSuccess: (outcome) => (outcome.saved ? queryClient.invalidateQueries({ queryKey: categoriesKey }) : undefined),
  })
}

/** Adds a top-level category, or a subcategory when `parentId` is set. */
export function useCreateCategory() {
  return useCategoryMutation(async (body: CategoryFields & { parentId: string | null }) => {
    const { response, error } = await api.POST('/api/v1/categories', { body })
    return outcomeOf('Adding a category', response, error)
  })
}

export function useUpdateCategory() {
  return useCategoryMutation(async ({ id, ...body }: CategoryFields & { id: string }) => {
    const { response, error } = await api.PUT('/api/v1/categories/{id}', { params: { path: { id } }, body })
    return outcomeOf('Changing a category', response, error)
  })
}

/** Archives a category and its subcategories. */
export function useArchiveCategory() {
  return useCategoryMutation(async (id: string) => {
    const { response, error } = await api.DELETE('/api/v1/categories/{id}', { params: { path: { id } } })
    return outcomeOf('Archiving a category', response, error)
  })
}
