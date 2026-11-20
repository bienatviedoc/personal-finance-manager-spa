// The headers the SPA is served with (spec section 8), in one place: `vite preview` sends them (vite.config.ts)
// and the nginx image is built with them (scripts/nginx-security-headers.ts), so the two cannot drift.
import { createHash } from 'node:crypto'

type Options = {
  /** The page as served: its inline scripts are allowed by their hashes. */
  indexHtml: string
  /** The error tracker's DSN the app is built with (VITE_SENTRY_DSN), when it has one. */
  sentryDsn?: string
}

/**
 * Everything loads from the app's own origin. Scripts in particular: an injected script, inline or from
 * elsewhere, does not run. The exceptions, each for a reason:
 * - the inline script in index.html that sets the theme before the first paint, by the hash of its text;
 * - inline styles: components colour things with `style` (a category's colour), and the dialog primitives add a
 *   style element while open. A stylesheet cannot run code;
 * - `data:` images, which the bundler makes of small assets;
 * - the error tracker's address, for reports, only when the app is built with one.
 */
export function contentSecurityPolicy({ indexHtml, sentryDsn }: Options): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...inlineScriptHashes(indexHtml)]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(sentryDsn ? [new URL(sentryDsn).origin] : [])]],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

export function securityHeaders(options: Options): Record<string, string> {
  return {
    'Content-Security-Policy': contentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    // Links in emails carry tokens in the address (/reset-password?token=…); no other site gets to see it.
    'Referrer-Policy': 'no-referrer',
    // A year, the least browsers treat as a lasting promise to use HTTPS. Ignored over plain http://localhost.
    'Strict-Transport-Security': 'max-age=31536000',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
  }
}

/** The headers as lines for an nginx `server` or `location` block. */
export function nginxHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `add_header ${name} "${value}" always;\n`)
    .join('')
}

/** `'sha256-…'` for each script written into the page itself; scripts loaded by `src` are covered by 'self'. */
function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, script]) => `'sha256-${createHash('sha256').update(script ?? '').digest('base64')}'`,
  )
}
