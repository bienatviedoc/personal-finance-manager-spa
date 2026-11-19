import { createElement } from 'react'
import { iconFor } from './appearance'

const iconProps = { className: 'size-4' }

/** A category's icon on its colour. Decorative: the name next to it says what it is. */
export function CategoryBadge({ icon, color }: { icon: string; color: string }) {
  return (
    <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}>
      {createElement(iconFor(icon), iconProps)}
    </span>
  )
}
