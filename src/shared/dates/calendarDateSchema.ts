import { z } from 'zod'
import { calendarDatePattern } from './formatDate'

/** A form field for a calendar date, as a date input holds it. `invalid` is the translation key of the form's own message. */
export const calendarDate = (invalid: string) => z.string().regex(calendarDatePattern, { error: invalid })
