import { refusedFields } from './refusedFields'

/**
 * What saving a record guarded by a row version answers (an account, a transaction): the record as the API
 * saved it, under its own name (`{ saved: true, account }`); the fields a 400 refused; or stale.
 */
export type VersionedSaveOutcome<Name extends string, Entity, Field extends string> =
  | ({ saved: true } & Record<Name, Entity>)
  | { saved: false; fields: Field[] }
  /** The record changed since the row version the edit was made from: nothing was saved. Load it again. */
  | { saved: false; stale: true }

/** What the API client answers a save with: the record when it was saved, otherwise the error and the response to read it from. */
export type VersionedSaveResponse<Entity> = { data?: Entity; error?: unknown; response: Response }

/**
 * Reads the API's answer to saving such a record into its outcome: saved, stale on a 412, or the fields a 400
 * refused among the ones the form shows a message for. Anything else throws.
 */
export function versionedSaveOutcome<Name extends string, Entity, Field extends string>(
  name: Name,
  { data, error, response }: VersionedSaveResponse<Entity>,
  fields: readonly Field[],
): VersionedSaveOutcome<Name, Entity, Field> {
  if (data) return { saved: true, [name]: data } as { saved: true } & Record<Name, Entity>
  if (response.status === 412) return { saved: false, stale: true }
  const refused = refusedFields(response, error, fields)
  if (refused) return { saved: false, fields: refused }
  throw new Error(`Saving the ${name} failed: ${response.status}`)
}

/** Whether the save found the record changed somewhere else: the one place that reads an outcome as stale. */
export function isStale<Outcome extends VersionedSaveOutcome<string, unknown, string>>(
  outcome: Outcome | undefined,
): outcome is Extract<Outcome, { stale: true }> {
  return outcome !== undefined && !outcome.saved && 'stale' in outcome
}

/** The `If-Match` header that names the row version an edit was made from: an entity tag, so in quotes. */
export function ifMatch(rowVersion: string): string {
  return `"${rowVersion}"`
}
