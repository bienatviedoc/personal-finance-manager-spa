import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { refusedFields } from '@/shared/api/refusedFields'
import type { components } from '@/shared/api/schema'

export type Attachment = components['schemas']['AttachmentResponse']

/** What can be attached (spec TXN-6). The API decides, from the file itself; these let the screen say so before sending. */
export const attachmentTypes = ['image/jpeg', 'image/png', 'application/pdf'] as const
/** 5 MB. */
export const maxAttachmentSize = 5 * 1024 * 1024

/** Why a file cannot be attached, as far as the browser can tell; null when it can be sent. */
export function whyNotAttachable(file: Pick<File, 'type' | 'size'>): 'type' | 'tooLarge' | 'empty' | null {
  if (!(attachmentTypes as readonly string[]).includes(file.type)) return 'type'
  if (file.size === 0) return 'empty'
  if (file.size > maxAttachmentSize) return 'tooLarge'
  return null
}

const attachmentsKey = (transactionId: string) => ['attachments', transactionId]

/** The attachments of one transaction, the first attached first. A transaction has a handful, so all of them. */
export const attachmentsQuery = (transactionId: string) =>
  queryOptions({
    queryKey: attachmentsKey(transactionId),
    queryFn: async () => {
      const { data, response } = await api.GET('/api/v1/transactions/{id}/attachments', { params: { path: { id: transactionId } } })
      if (!data) throw new Error(`Could not load attachments: ${response.status}`)
      return data.items
    },
  })

/** Attached, or refused by the API for what the file is: not a JPEG, PNG or PDF by its content, or over 5 MB. */
export type AttachOutcome = { saved: true; attachment: Attachment } | { saved: false; fields: 'file'[] }

/** Attaches a file to the transaction. The API reads what the file is from the file itself. */
export function useAddAttachment(transactionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File): Promise<AttachOutcome> => {
      const { data, error, response } = await api.POST('/api/v1/transactions/{id}/attachments', {
        params: { path: { id: transactionId } },
        // The generated type calls a file a string; it travels as the file field of a form.
        body: { file: file as unknown as string },
        bodySerializer: () => {
          const form = new FormData()
          form.append('file', file)
          return form
        },
      })
      if (data) return { saved: true, attachment: data }
      const fields = refusedFields(response, error, ['file'] as const)
      if (fields) return { saved: false, fields }
      throw new Error(`Attaching a file failed: ${response.status}`)
    },
    onSuccess: (outcome) => (outcome.saved ? queryClient.invalidateQueries({ queryKey: attachmentsKey(transactionId) }) : undefined),
  })
}

/** Removes an attachment from the transaction; the API deletes its file. */
export function useRemoveAttachment(transactionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/attachments/{id}', { params: { path: { id } } })
      // Not found: removed already, which is what was asked for.
      if (!response.ok && response.status !== 404) throw new Error(`Removing an attachment failed: ${response.status}`)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: attachmentsKey(transactionId) }),
  })
}

/**
 * Opens an attached file in a new tab. The file is served only through a signed URL that works for a few
 * minutes, so one is asked for each time and never kept: this is a change the user makes, not something read
 * into the cache.
 */
export function useOpenAttachment() {
  return useMutation({
    mutationFn: async (id: string) => {
      // Opened now, in the click itself: a tab opened once the API has answered is a pop-up, which browsers block.
      const tab = window.open('', '_blank')
      if (!tab) throw new Error('The browser opened no tab for the attachment')
      try {
        const { data, response } = await api.GET('/api/v1/attachments/{id}', { params: { path: { id } } })
        if (!data) throw new Error(`Could not get the URL of an attachment: ${response.status}`)
        // The file is served from the storage's own site: it gets no handle on the app.
        tab.opener = null
        tab.location.replace(data.url)
      } catch (error) {
        tab.close()
        throw error
      }
    },
  })
}
