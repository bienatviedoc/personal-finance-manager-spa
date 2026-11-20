import type { ReactNode } from 'react'

/** Says that something went wrong, announced at once to screen readers. The text is already translated. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  )
}
