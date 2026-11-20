// Prints the SPA's security headers as nginx configuration, for the built page in dist/. The image build runs it
// after `npm run build`, with the same VITE_SENTRY_DSN, and nginx includes the result (nginx/default.conf.template).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnv } from 'vite'
import { nginxHeaders, securityHeaders } from '../security-headers.ts'

const root = path.resolve(import.meta.dirname, '..')
const indexHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8')
// Read the way the build read it: from the environment or an .env file.
const sentryDsn = loadEnv('production', root, 'VITE_').VITE_SENTRY_DSN || undefined
process.stdout.write(nginxHeaders(securityHeaders({ indexHtml, sentryDsn })))
