import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { securityHeaders } from './security-headers.ts'

export default defineConfig(({ mode }) => {
  // The headers the built app is served with; the nginx image is built with the same ones (see security-headers.ts).
  const { 'Content-Security-Policy': contentSecurityPolicy, ...otherHeaders } = securityHeaders({
    indexHtml: readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
    // Read the way the app's own build reads it: from the environment or an .env file.
    sentryDsn: loadEnv(mode, import.meta.dirname, 'VITE_').VITE_SENTRY_DSN || undefined,
  })

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // The API runs on :8080 (docker compose up in the API repository). Proxying keeps the browser on
      // one origin, so the session cookie is first-party and SameSite=Strict holds.
      proxy: { '/api': 'http://localhost:8080' },
      // Without the content security policy: hot reload runs inline scripts and opens a socket, which it forbids.
      headers: otherHeaders,
    },
    // `npm run preview` serves the production build as the nginx image does, policy included.
    preview: {
      proxy: { '/api': 'http://localhost:8080' },
      headers: { 'Content-Security-Policy': contentSecurityPolicy, ...otherHeaders },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.js', 'security-headers.test.ts'],
      restoreMocks: true,
    },
  }
})
