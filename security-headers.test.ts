import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { nginxHeaders, securityHeaders } from './security-headers.ts'

const indexHtml = readFileSync(path.join(import.meta.dirname, 'index.html'), 'utf8')

/** The policy as a map from directive to its sources. */
function policyOf(headers: Record<string, string>) {
  const directives = headers['Content-Security-Policy']!.split(';').map((directive) => directive.trim().split(/\s+/))
  return Object.fromEntries(directives.map(([name, ...sources]) => [name, sources]))
}

describe('the content security policy the SPA is served with', () => {
  it('lets an inline script run only by the hash of its exact text', () => {
    // The digest of "alert(1)", worked out with openssl rather than by the code under test.
    const policy = policyOf(securityHeaders({ indexHtml: '<script>alert(1)</script><script type="module" src="/main.js"></script>' }))

    expect(policy['script-src']).toEqual(["'self'", "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"])
  })

  it('allows the script in index.html that sets the theme before the first paint, and no other inline script', () => {
    const policy = policyOf(securityHeaders({ indexHtml }))

    expect(policy['script-src']).toHaveLength(2)
    expect(policy['script-src']![1]).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/)
    expect(policy['script-src']).not.toContain("'unsafe-inline'")
    expect(policy['script-src']).not.toContain("'unsafe-eval'")
  })

  it('loads everything else from the app’s own origin, and cannot be framed', () => {
    const policy = policyOf(securityHeaders({ indexHtml }))

    expect(policy['default-src']).toEqual(["'self'"])
    expect(policy['connect-src']).toEqual(["'self'"])
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'self'"])
    expect(policy['form-action']).toEqual(["'self'"])
    expect(policy['frame-ancestors']).toEqual(["'none'"])
  })

  it('lets error reports reach the error tracker when the app is built with one, and nothing else', () => {
    const policy = policyOf(securityHeaders({ indexHtml, sentryDsn: 'https://public-key@o123.ingest.sentry.io/456' }))

    expect(policy['connect-src']).toEqual(["'self'", 'https://o123.ingest.sentry.io'])
  })
})

describe('the security headers the SPA is served with', () => {
  it('tell the browser to treat the app strictly', () => {
    expect(securityHeaders({ indexHtml })).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=()',
    })
  })

  it('are written for nginx one header a line, on every answer', () => {
    const lines = nginxHeaders({ 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'" }).trim().split('\n')

    expect(lines).toEqual(['add_header X-Frame-Options "DENY" always;', `add_header Content-Security-Policy "default-src 'self'" always;`])
  })
})
