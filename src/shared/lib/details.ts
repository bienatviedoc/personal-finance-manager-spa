/** What stands between the parts of one line of details under a row's title: `Groceries · Everyday · 2 Nov 2026`. */
export const detailSeparator = ' · '

/** The parts of a line of details that are there, between separators. */
export function joinDetails(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(detailSeparator)
}
