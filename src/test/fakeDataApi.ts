import { http, HttpResponse } from 'msw'
import { apiUrl as url, problem, refuseWithoutToken, server, testPassword } from './server'

/** The name the fake gives the export, as the real API does: with the user's date of the export. */
export const testExportFileName = 'personal-finance-manager-2026-11-23.zip'

/**
 * A stand-in for the full export and for deleting the user (`/api/v1/export/all.zip`, `/api/v1/me/deletion`),
 * following the same rules as the real API (see the API's DataExportTests and UserDeletionTests). Deleting
 * signs the user out: `GET /me` answers 401 from then on. Returns the state as it stands, for assertions.
 */
export function fakeDataApi() {
  const state = {
    exports: 0,
    /** Whether the user asked to be deleted, which deactivates them and signs them out. */
    deactivated: false,
    deletionAttempts: 0,
  }

  server.use(
    http.get(url('/api/v1/export/all.zip'), () => {
      state.exports += 1
      // Not a real archive: the app hands the file over as it came, and never looks inside.
      return new HttpResponse(new TextEncoder().encode('PK-test-archive'), {
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename=${testExportFileName}; filename*=UTF-8''${testExportFileName}` },
      })
    }),
    http.post(url('/api/v1/me/deletion'), async ({ request }) => {
      const refused = refuseWithoutToken(request)
      if (refused) return refused
      state.deletionAttempts += 1
      const { password } = (await request.json()) as { password: string }
      if (password !== testPassword) return problem(400, { errors: { password: ['The password is incorrect.'] } })
      state.deactivated = true
      server.use(http.get(url('/api/v1/me'), () => problem(401)))
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
