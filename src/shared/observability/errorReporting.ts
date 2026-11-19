import * as Sentry from '@sentry/react'
import { traceIdOf, traceparentHeader } from './traceparent'

/**
 * Unhandled errors go to the error tracker (Sentry), which is a third party. A report says what
 * failed and where, never what the user was doing it with: it carries the error, the address
 * without its query, and the API calls that failed before it with their trace ids, which find the
 * API's side in our own logs and traces. No console output, clicks, typing, request bodies or user.
 *
 * An Error's message and stack are sent as they are, so never put financial content (a payee, an
 * amount, a note) in an Error message. Anything thrown that is not an Error is not sent at all.
 */

type Options = {
  dsn: string
  environment: string
  /** Where reports go; Sentry's own transport unless a test supplies one. */
  transport?: Sentry.BrowserOptions['transport']
}

const apiCategory = 'api'
const notAnError = 'Something that is not an Error was thrown; its value is left out.'

/**
 * Starts reporting. Returns a function that stops it, sending anything still queued and forgetting
 * the failed API calls recorded so far.
 */
export function startErrorReporting({ dsn, environment, transport }: Options): () => Promise<void> {
  const client = Sentry.init({
    dsn,
    environment,
    transport,
    // Sentry collects all of these by default; scrub() below is the second line of defence.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // Only our own breadcrumbs (failed API calls), not console output, clicks or every request.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Breadcrumbs'),
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === apiCategory ? breadcrumb : null),
    beforeSend: scrub,
  })

  return async () => {
    await client?.close()
    Sentry.getIsolationScope().clearBreadcrumbs()
  }
}

/** Reports an error that was caught, such as by a screen's error boundary. A no-op until reporting starts. */
export function reportError(error: unknown) {
  Sentry.captureException(error)
}

/**
 * Records an API call that failed, so a report that follows names its trace: one the server
 * failed, or one that got no response at all. The path is sent without its query string.
 */
export function recordFailedApiCall(request: Request, response?: Response) {
  const traceId = traceIdOf(request.headers.get(traceparentHeader))
  Sentry.addBreadcrumb({
    category: apiCategory,
    level: 'error',
    data: { method: request.method, path: new URL(request.url).pathname, status: response?.status, trace_id: traceId },
  })
}

function scrub(event: Sentry.ErrorEvent, hint: Sentry.EventHint): Sentry.ErrorEvent {
  if (event.request) {
    event.request = { url: event.request.url ? withoutQuery(event.request.url) : undefined }
  }
  delete event.user
  // What was thrown when it is not an Error (a problem response, a string) may hold anything.
  // Sentry puts an object in `extra` and its keys, or a primitive itself, in the message.
  delete event.extra
  if (!(hint.originalException instanceof Error)) {
    delete event.message
    for (const exception of event.exception?.values ?? []) exception.value = notAnError
  }
  return event
}

function withoutQuery(url: string) {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}
