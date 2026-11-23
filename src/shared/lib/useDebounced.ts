import { useEffect, useState } from 'react'

/** The value once it has stopped changing for `delay` milliseconds: what to ask the API about while the user types. */
export function useDebounced<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
