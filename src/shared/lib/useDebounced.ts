import { useEffect, useState } from 'react'

/** How long, in milliseconds, typing is left alone before what was typed is asked about. */
export const typingSettles = 250

/** The value once it has stopped changing for `delay` milliseconds: what to ask the API about while the user types. */
export function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
