// Prints the SPA's security headers as nginx configuration, for the built page in dist/. The image build runs it
// after `npm run build`, with the same VITE_SENTRY_DSN, and nginx includes the result (nginx/default.conf.template).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { nginxHeaders, securityHeaders } from '../security-headers.ts'

const indexHtml = await readFile(path.resolve(import.meta.dirname, '../dist/index.html'), 'utf8')
process.stdout.write(nginxHeaders(securityHeaders({ indexHtml, sentryDsn: process.env.VITE_SENTRY_DSN || undefined })))
