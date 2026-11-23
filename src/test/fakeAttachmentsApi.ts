import { http, HttpResponse } from 'msw'
import type { components } from '@/shared/api/schema'
import { apiUrl, problem, refuseWithoutToken, server } from './server'

type Attachment = components['schemas']['AttachmentResponse']

const fiveMegabytes = 5 * 1024 * 1024

/** What a file is, read from its first bytes as the API reads it: its name and declared type prove nothing. */
function contentTypeOf(start: Uint8Array) {
  const startsWith = (signature: number[]) => signature.every((byte, index) => start[index] === byte)
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

type Options = {
  /** The transactions attachments are on, as `fakeTransactionsApi` keeps them: one that is not there takes none. */
  transactions: { id: string }[]
}

/**
 * A stand-in for the API's attachment endpoints, keeping state across requests and following the same rules as
 * the real API (see the API's AttachmentTests): a transaction's attachments are listed the first attached
 * first; a file is sent as the `file` field of a form and is a JPEG, PNG or PDF by its first bytes, of at most
 * 5 MB, or the answer is a 400 naming `file`; `GET /attachments/{id}` answers a signed URL, a new one each
 * time; removing one takes it off its transaction; anything on a transaction or attachment that is not there
 * is a 404.
 */
export function fakeAttachmentsApi(attachments: (Partial<Attachment> & Pick<Attachment, 'transactionId'>)[] = [], { transactions }: Options) {
  let attached = 0
  const state = {
    attachments: attachments.map(
      (attachment, index): Attachment => ({
        id: `01970000-0000-7000-8000-5000000000${String(index).padStart(2, '0')}`,
        fileName: 'receipt.pdf',
        contentType: 'application/pdf',
        size: 1024,
        ...attachment,
      }),
    ),
    /** Every signed URL handed out, in the order they were asked for. */
    signedUrls: [] as string[],
    /** How many uploads arrived, refused ones included. */
    uploads: 0,
    /** The next request to these endpoints fails with a 500, having changed nothing. */
    failNext() {
      failing = true
    },
  }
  let failing = false

  const failed = () => {
    if (!failing) return null
    failing = false
    return problem(500)
  }
  const hasTransaction = (id: unknown) => transactions.some((transaction) => transaction.id === id)
  const refused = (message: string) => problem(400, { errors: { file: [message] } })

  server.use(
    http.get(apiUrl('/api/v1/transactions/:id/attachments'), ({ params }) => {
      if (!hasTransaction(params.id)) return problem(404)
      return failed() ?? HttpResponse.json({ items: state.attachments.filter((attachment) => attachment.transactionId === params.id) })
    }),
    http.post(apiUrl('/api/v1/transactions/:id/attachments'), async ({ request, params }) => {
      state.uploads++
      const stopped = refuseWithoutToken(request) ?? failed()
      if (stopped) return stopped
      if (!hasTransaction(params.id)) return problem(404)
      const file = (await request.formData()).get('file')
      if (file === null || typeof file === 'string') return refused('Choose a file to attach.')
      if (file.size === 0) return refused('This file is empty.')
      if (file.size > fiveMegabytes) return refused('Attach a file of at most 5 MB.')
      const contentType = contentTypeOf(new Uint8Array(await file.slice(0, 8).arrayBuffer()))
      if (!contentType) return refused('Attach a JPEG, PNG or PDF file.')
      const created: Attachment = {
        id: `01970000-0000-7000-8000-6${String(attached++).padStart(11, '0')}`,
        transactionId: String(params.id),
        fileName: file.name,
        contentType,
        size: file.size,
      }
      state.attachments.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.get(apiUrl('/api/v1/attachments/:id'), ({ params }) => {
      const stopped = failed()
      if (stopped) return stopped
      if (!state.attachments.some((attachment) => attachment.id === params.id)) return problem(404)
      const url = `https://storage.test/pfm-attachments/${String(params.id)}?X-Amz-Expires=300&X-Amz-Signature=${state.signedUrls.length + 1}`
      state.signedUrls.push(url)
      return HttpResponse.json({ url, expiresAt: new Date(Date.now() + 300_000).toISOString() })
    }),
    http.delete(apiUrl('/api/v1/attachments/:id'), ({ request, params }) => {
      const stopped = refuseWithoutToken(request) ?? failed()
      if (stopped) return stopped
      const found = state.attachments.find((attachment) => attachment.id === params.id)
      if (!found) return problem(404)
      state.attachments.splice(state.attachments.indexOf(found), 1)
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
