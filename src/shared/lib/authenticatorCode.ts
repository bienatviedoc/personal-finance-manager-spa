import { z } from 'zod'

/**
 * A form field for the code an authenticator app shows: six digits, often typed in two groups, so spaces and
 * hyphens are let go of. `invalid` is the translation key of the form's own message for anything else.
 */
export const authenticatorCode = (invalid: string) =>
  z
    .string()
    .transform((typed) => typed.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, { error: invalid }))
