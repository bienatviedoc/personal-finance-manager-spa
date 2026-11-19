/**
 * The fields a 400 validation problem names, among the ones the caller shows a message for; null for any
 * other answer, or a 400 that names none of them. The API's messages are English, so screens show their
 * own, translated, for each field.
 */
export function refusedFields<Field extends string>(response: Response, error: unknown, known: readonly Field[]): Field[] | null {
  if (response.status !== 400) return null
  const errors = (error as { errors?: Record<string, string[]> } | undefined)?.errors
  if (!errors) return null
  const fields = known.filter((field) => field in errors)
  return fields.length > 0 ? fields : null
}
