/**
 * Limits the API holds that its OpenAPI document does not carry, so the generated types cannot: one place for the
 * SPA to repeat each, for fast feedback only, as the API checks it again.
 */

/** The most characters a payee has (the API's `Transaction.MaxPayeeLength`): a longer one is refused, and matches none. */
export const maxPayeeLength = 200
