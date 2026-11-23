import { createContext, useContext } from 'react'

/** Opens the drawer that records a transaction, from any screen inside the shell. */
export const QuickAddContext = createContext<(() => void) | null>(null)

/** What a screen's own "Add transaction" button calls: the same drawer N opens. */
export function useQuickAdd() {
  const open = useContext(QuickAddContext)
  if (!open) throw new Error('useQuickAdd needs <QuickAdd> above it.')
  return open
}
