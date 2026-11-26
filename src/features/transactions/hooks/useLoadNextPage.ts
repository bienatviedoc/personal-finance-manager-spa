import { useCallback } from 'react'

type Pages = { hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => Promise<unknown> }

/**
 * Loads the next page of an infinite list as its last row comes near the screen. A page that failed to load is
 * asked for again by the user, not by the list at every render.
 */
export function useLoadNextPage({ hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage }: Pages) {
  return useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])
}
