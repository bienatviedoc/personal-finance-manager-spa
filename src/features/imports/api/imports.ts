import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

/** One uploaded statement file and the transactions created from it (see the glossary). */
export type ImportBatch = components['schemas']['ImportBatchResponse']
/** How a statement file is read (see the glossary): what the preview and the commit are sent. Columns are counted from 0. */
export type Mapping = components['schemas']['MappingResponse']
/** A statement read with a mapping, every row of it. */
export type ImportPreview = components['schemas']['ImportPreviewResponse']
export type PreviewRow = components['schemas']['PreviewRowResponse']

/**
 * What starting again after a failed import carries, as router state: to the upload screen the account (unless it is
 * the reason the import stopped), and on to the next batch the mapping, to start from instead of the API's guess.
 */
export type StartAgain = { accountId?: string; mapping?: Mapping | null }

const uploadFields = ['accountId', 'file'] as const
export type UploadField = (typeof uploadFields)[number]
/** What uploading answers: the batch, to map and preview, or the fields the API refused. */
export type UploadOutcome = { saved: true; batch: ImportBatch } | { saved: false; fields: UploadField[] }

const commitFields = ['rows', 'expenseCategoryId', 'incomeCategoryId', 'mapping', 'accountId'] as const
export type CommitField = (typeof commitFields)[number]
/** What committing answers: the batch, now being imported; the fields the API refused; or that it was committed already, elsewhere. */
export type CommitOutcome = { saved: true; batch: ImportBatch } | { saved: false; fields: CommitField[] } | { saved: false; committed: true }

const importsKey = ['imports']
const batchKey = (id: string) => [...importsKey, id]

/**
 * One import batch. While the worker imports it (`committing`) it is asked for again every second, so the count of
 * what is imported shows growing (spec section 5: a background job with progress).
 */
export const importBatchQuery = (id: string) =>
  queryOptions({
    queryKey: batchKey(id),
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/imports/{id}', { params: { path: { id } } })
      if (!data) throw new Error(`Could not load the import: ${response.status}`)
      return data
    },
    refetchInterval: (query) => (query.state.data?.status === 'committing' ? 1000 : false),
  })

/**
 * The statement read with a mapping (spec IMP-1): every row, the transaction each says, the rows that cannot be
 * read and why, and the likely duplicates, unticked. Asked for again with every change to the mapping, showing
 * the last answer meanwhile.
 */
export const importPreviewQuery = (id: string, mapping: Mapping) =>
  queryOptions({
    queryKey: [...batchKey(id), 'preview', mapping],
    queryFn: async () => {
      const query = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value !== null)) as { [Choice in keyof Mapping]?: Exclude<Mapping[Choice], null> }
      const { data, response } = await api.GET('/api/v1/imports/{id}/preview', { params: { path: { id }, query } })
      if (!data) throw new Error(`Could not preview the statement: ${response.status}`)
      return data
    },
    placeholderData: keepPreviousData,
  })

/** Uploads a statement file for an account (`UploadStatement`). Nothing is imported yet. */
export function useUploadStatement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ accountId, file }: { accountId: string; file: File }): Promise<UploadOutcome> => {
      const { data, error, response } = await api.POST('/api/v1/imports', {
        // The generated type calls a file a string; it travels as the file field of a form, beside the account.
        body: { accountId, file: file as unknown as string },
        bodySerializer: () => {
          const form = new FormData()
          form.append('accountId', accountId)
          form.append('file', file)
          return form
        },
      })
      if (data) return { saved: true, batch: data }
      const fields = refusedFields(response, error, uploadFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Uploading a statement failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) queryClient.setQueryData(batchKey(outcome.batch.id), outcome.batch)
    },
  })
}

/** Commits the rows chosen (`CommitImport`): the API's worker imports them in the background. */
export function useCommitImport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { mapping: Mapping; rows: number[]; expenseCategoryId: string | null; incomeCategoryId: string | null }): Promise<CommitOutcome> => {
      const { data, error, response } = await api.POST('/api/v1/imports/{id}/commit', { params: { path: { id } }, body })
      if (data) return { saved: true, batch: data }
      if (response.status === 409) return { saved: false, committed: true }
      const fields = refusedFields(response, error, commitFields)
      if (fields) return { saved: false, fields }
      throw new Error(`Committing a statement failed: ${response.status}`)
    },
    onSuccess: (outcome) => {
      if (outcome.saved) queryClient.setQueryData(batchKey(id), outcome.batch)
      else if ('committed' in outcome) return queryClient.invalidateQueries({ queryKey: batchKey(id) })
    },
  })
}
