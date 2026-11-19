import * as Sentry from '@sentry/react'
import { traceIdOf } from './traceparent'

/**
 * Unhandled errors go to the error tracker (Sentry), which is a third party. A report says what
 * failed and where, never what the user was doing it with: it carries the error, the address
 * without its query, and the API calls that failed before it with their trace ids, which find the
 * API's side in our own logs and traces. No console output, clicks, typing, request bodies or user.
 */

type Options = {
  dsn: string
  environment: string
  /** Where reports go; Sentry's own transport unless a test supplies one. */
  transport?: Sentry.BrowserOptions['transport']
}

/** Starts reporting. Returns a function that stops it, sending anything still queued. */
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
  }
}

/** Reports an error that was caught, such as by a screen's error boundary. A no-op until reporting starts. */
export function reportError(error: unknown) {
  Sentry.captureException(error)
}

/**
 * Records an API call that failed on the server, so a report that follows names its trace. The
 * path is sent without its query string.
 */
export function recordFailedApiCall(request: Request, response: Response) {
  const traceId = traceIdOf(request.headers.get('traceparent'))
  Sentry.addBreadcrumb({
    category: apiCategory,
    level: 'error',
    data: { method: request.method, path: new URL(request.url).pathname, status: response.status, trace_id: traceId },
  })
}

const apiCategory = 'api'

function scrub(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    event.request = { url: event.request.url ? withoutQuery(event.request.url) : undefined }
  }
  delete event.user
  // Holds what was thrown when it is not an Error (a problem response, say), which may hold anything.
  delete event.extra
  return event
}

function withoutQuery(url: string) {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}
