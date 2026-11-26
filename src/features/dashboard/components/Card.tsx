import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn, focusRing } from '@/shared/lib/utils'

type Props = {
  title: string
  /** Where the screen or report behind the card is. */
  to: string
  /** What the link to it says. */
  linkLabel: string
  children: ReactNode
  className?: string
}

/** One card of the dashboard: a titled region that links to the screen or report behind it. */
export function Card({ title, to, linkLabel, children, className }: Props) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3 rounded-lg border p-4', className)}>
      <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      <div className="flex-1 space-y-3">{children}</div>
      <Link to={to} className={cn('self-start text-sm font-medium underline-offset-4 hover:underline', focusRing)}>
        {linkLabel}
      </Link>
    </section>
  )
}
