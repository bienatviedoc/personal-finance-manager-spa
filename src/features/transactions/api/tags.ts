import { queryOptions } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import { transactionsKey } from './transactions'

export type Tag = components['schemas']['TagResponse']

/** The most tags one transaction takes, and the longest a tag's name is (see `Transaction.MaxTags` and `Tag.MaxNameLength` in the API). */
export const maxTags = 20
export const maxTagLength = 50

/** A tag's name as the API keeps it: trimmed and in lower case, so `Japan-Trip` and `japan-trip` are one tag. */
export const tagName = (text: string) => text.trim().toLowerCase()

async function loadTags() {
  const names: string[] = []
  let cursor: string | undefined
  do {
    const { data, response } = await api.GET('/api/v1/tags', { params: { query: { cursor } } })
    if (!data) throw new Error(`Could not load tags: ${response.status}`)
    names.push(...data.items.map((tag) => tag.name))
    cursor = data.nextCursor ?? undefined
  } while (cursor)
  return names
}

/**
 * The names of the user's tags, by name: what the form suggests as a tag is typed, and the list filters by. A
 * user has dozens or hundreds, so every page is loaded. Under the transactions' key: saving a transaction can
 * create a tag, and loads it again.
 */
export const tagsQuery = queryOptions({
  queryKey: [...transactionsKey, 'tags'],
  queryFn: loadTags,
})
