import { palette } from '@/shared/lib/palette'

/**
 * The colours to draw a set of things in, each its own where it can be: a thing keeps the colour it was given
 * unless one drawn before it has it already (the subcategories of a category share its colour), and then
 * takes the first colour of the palette nothing has taken yet.
 */
export function distinctColors(colors: readonly string[]): string[] {
  const taken = new Set<string>()
  return colors.map((color) => {
    const own = color.toLowerCase()
    const chosen = taken.has(own) ? (palette.map((each) => each.value).find((each) => !taken.has(each)) ?? own) : own
    taken.add(chosen)
    return chosen
  })
}
