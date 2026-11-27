/**
 * Limits the API holds that its OpenAPI document does not carry, so the generated types cannot: one place for the
 * SPA to repeat each, for fast feedback only, as the API checks it again.
 */

/** The most characters a payee has (the API's `Transaction.MaxPayeeLength`): a longer one is refused, and matches none. */
export const maxPayeeLength = 200

/** The most transactions one bulk action takes (the API's `BulkEditTransactionsCommand.MaxSelected`): a view more pass cannot be selected whole. */
export const maxBulkSelection = 1000

/** The largest statement file the API takes (the API's `ImportBatch.MaxFileSize`): a larger one is refused before it is sent. */
export const maxStatementFileSize = 5 * 1024 * 1024

/** The most rows a statement mapping skips at either end (the API's `StatementMapping.MaxSkippedRows`). */
export const maxSkippedStatementRows = 1000
