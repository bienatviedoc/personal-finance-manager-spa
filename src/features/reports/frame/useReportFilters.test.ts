import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useReportFilters } from './useReportFilters'

/** The address as the router last rendered it, and every address the hook asked the router for. */
const router = vi.hoisted(() => ({ rendered: new URLSearchParams(), asked: [] as string[] }))

vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useSearchParams: () => [router.rendered, (next: URLSearchParams) => router.asked.push(next.toString())],
}))
vi.mock('@/features/settings', () => ({ useUserSettings: () => ({ timeZone: 'Asia/Ho_Chi_Minh' }) }))

describe('useReportFilters', () => {
  it('keeps every change when the router renders an older address after a newer change was asked for', () => {
    router.rendered = new URLSearchParams()
    router.asked = []
    const { result, rerender } = renderHook(() => useReportFilters())

    result.current.change({ period: 'last3Months' })
    result.current.change({ accountId: 'a-card' })
    // The router applies each address in a transition, so it can render the first after the second was asked for.
    router.rendered = new URLSearchParams(router.asked[0])
    rerender()
    result.current.change({ categoryId: 'c-food' })

    expect(Object.fromEntries(new URLSearchParams(router.asked.at(-1)))).toEqual({ period: 'last3Months', accountId: 'a-card', categoryId: 'c-food' })
  })

  it('changes from an address the router renders that it was not asked for, such as one a link opened', () => {
    router.rendered = new URLSearchParams()
    router.asked = []
    const { result, rerender } = renderHook(() => useReportFilters())

    result.current.change({ accountId: 'a-card' })
    router.rendered = new URLSearchParams('view=table')
    rerender()
    result.current.change({ compare: true })

    expect(Object.fromEntries(new URLSearchParams(router.asked.at(-1)))).toEqual({ view: 'table', compare: 'true' })
  })
})
