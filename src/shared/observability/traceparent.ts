/**
 * A W3C Trace Context `traceparent` header that starts a new trace. The API joins it, so its logs,
 * its spans and the database calls it makes all carry the trace id the browser chose.
 */
export function newTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`
}

/** Random, never all zeros (which the spec reserves for "invalid"). */
function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes))
  if (values.every((value) => value === 0)) values[0] = 1
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}
