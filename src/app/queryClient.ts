import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(options: { retry?: boolean } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: options.retry ?? 2, staleTime: 30_000 },
      mutations: { retry: false },
    },
  })
}
