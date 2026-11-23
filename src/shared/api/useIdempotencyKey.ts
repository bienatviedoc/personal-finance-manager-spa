import { useCallback, useRef } from 'react'

/**
 * The `Idempotency-Key` for each request the user means to make (spec section 11). Sending the same body again
 * after a failure takes the same key, so the API cannot record it twice; a changed body is a new request and
 * takes a new key, since the API refuses a used key that comes with a different body. `next` starts a new
 * request whatever comes next, as after a save that went through.
 */
export function useIdempotencyKey() {
  const attempt = useRef<{ key: string; sent?: string }>({ key: crypto.randomUUID() })
  const keyFor = useCallback((body: unknown) => {
    const sending = JSON.stringify(body)
    if (attempt.current.sent !== undefined && attempt.current.sent !== sending) attempt.current.key = crypto.randomUUID()
    attempt.current.sent = sending
    return attempt.current.key
  }, [])
  const next = useCallback(() => {
    attempt.current = { key: crypto.randomUUID() }
  }, [])
  return { keyFor, next }
}
