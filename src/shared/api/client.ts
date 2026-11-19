import createClient, { type Middleware } from 'openapi-fetch'
import { recordFailedApiCall } from '@/shared/observability/errorReporting'
import { newTraceparent } from '@/shared/observability/traceparent'
import type { paths } from './schema'

/**
 * The typed API client. Types come from the API's OpenAPI document (`npm run api:sync`); never
 * write request or response types by hand.
 */
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: 'same-origin',
  // Looked up per request rather than captured once, so anything that wraps fetch later (such as
  // the test server) is honoured.
  fetch: (request) => globalThis.fetch(request),
})

const changesSomething = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let antiforgeryToken: Promise<string> | undefined

/**
 * Every request that changes something carries the anti-forgery token. The token lives only in
 * memory and is tied to who is signed in, so it is forgotten whenever that changes.
 */
const antiforgery: Middleware = {
  async onRequest({ request }) {
    if (!changesSomething.has(request.method)) return undefined
    antiforgeryToken ??= fetchAntiforgeryToken()
    request.headers.set('X-XSRF-TOKEN', await antiforgeryToken)
    return request
  },
}

/**
 * Every request starts a trace of its own, which the API and its database calls join. A call the
 * server failed is remembered, so an error report that follows names its trace.
 */
const traceContext: Middleware = {
  onRequest({ request }) {
    request.headers.set('traceparent', newTraceparent())
    return request
  },
  onResponse({ request, response }) {
    if (response.status >= 500) recordFailedApiCall(request, response)
    return undefined
  },
}

api.use(traceContext, antiforgery)

/** Call after signing in or out: the next request that changes something fetches a new token. */
export function forgetAntiforgeryToken() {
  antiforgeryToken = undefined
}

async function fetchAntiforgeryToken(): Promise<string> {
  // Not through `api`, so this request does not pass through the middleware above.
  const response = await fetch(`${window.location.origin}/api/v1/auth/antiforgery`, {
    credentials: 'same-origin',
    headers: { traceparent: newTraceparent() },
  })
  if (!response.ok) {
    antiforgeryToken = undefined
    throw new Error(`Could not get an anti-forgery token: ${response.status}`)
  }
  const { token } = (await response.json()) as paths['/api/v1/auth/antiforgery']['get']['responses'][200]['content']['application/json']
  return token
}
