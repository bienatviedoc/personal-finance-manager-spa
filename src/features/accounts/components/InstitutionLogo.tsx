import { Landmark } from 'lucide-react'
import { logos } from './institutionLook'

/** The institution's logo on its colour; a plain badge when it has neither. Decorative: the name says who it is. */
export function InstitutionLogo({ logoKey, color }: { logoKey?: string | null; color?: string | null }) {
  const Icon = logos.find((logo) => logo.key === logoKey)?.Icon ?? Landmark
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      style={color ? { backgroundColor: color, color: 'white' } : undefined}
    >
      <Icon className="size-5" />
    </span>
  )
}
