import { http, HttpResponse } from 'msw'
import { apiUrl as url, problem, refuseWithoutToken, server, testPassword, testUser } from './server'

/** The key the fake hands out, and the code an authenticator set up with it is taken to show. */
export const testAuthenticatorKey = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
export const testAuthenticatorCode = '123456'

/**
 * A stand-in for the signed-in user's security endpoints (`/api/v1/me/password` and `/api/v1/me/two-factor...`),
 * keeping state across requests and following the same rules as the real API (see the API's TwoFactorTests and
 * ChangePasswordTests). Returns the state as it stands, for assertions.
 */
export function fakeSecurityApi({ twoFactor = false }: { twoFactor?: boolean } = {}) {
  let batch = 0
  const newRecoveryCodes = () => {
    batch += 1
    return Array.from({ length: 10 }, (_, index) => `CODE${batch}-${String(index).padStart(5, '0')}`)
  }
  const state = {
    password: testPassword,
    twoFactorEnabled: twoFactor,
    recoveryCodes: twoFactor ? newRecoveryCodes() : ([] as string[]),
    /** How many times each endpoint was called, by its last path segment. */
    calls: {} as Record<string, number>,
  }

  /** Counts the call, and refuses it the way the real API would before looking at the body. */
  const guard = (name: string, request: Request) => {
    state.calls[name] = (state.calls[name] ?? 0) + 1
    return refuseWithoutToken(request)
  }
  const wrongPassword = (field: string) => problem(400, { errors: { [field]: ['The password is incorrect.'] } })

  server.use(
    http.get(url('/api/v1/me/two-factor'), () =>
      HttpResponse.json({ enabled: state.twoFactorEnabled, recoveryCodesLeft: state.recoveryCodes.length }),
    ),
    http.post(url('/api/v1/me/two-factor/setup'), ({ request }) => {
      const refused = guard('setup', request)
      if (refused) return refused
      if (state.twoFactorEnabled) return problem(409)
      const issuer = encodeURIComponent('Personal Finance Manager')
      return HttpResponse.json({
        key: testAuthenticatorKey,
        authenticatorUri: `otpauth://totp/${issuer}:${encodeURIComponent(testUser.email)}?secret=${testAuthenticatorKey}&issuer=${issuer}&digits=6`,
      })
    }),
    http.post(url('/api/v1/me/two-factor/enable'), async ({ request }) => {
      const refused = guard('enable', request)
      if (refused) return refused
      const { code } = (await request.json()) as { code: string }
      if (state.twoFactorEnabled || code.replace(/[\s-]/g, '') !== testAuthenticatorCode) {
        return problem(400, { errors: { code: ['That code is not right.'] } })
      }
      state.twoFactorEnabled = true
      state.recoveryCodes = newRecoveryCodes()
      return HttpResponse.json({ recoveryCodes: state.recoveryCodes })
    }),
    http.post(url('/api/v1/me/two-factor/disable'), async ({ request }) => {
      const refused = guard('disable', request)
      if (refused) return refused
      const { password } = (await request.json()) as { password: string }
      if (password !== state.password) return wrongPassword('password')
      state.twoFactorEnabled = false
      state.recoveryCodes = []
      return new HttpResponse(null, { status: 204 })
    }),
    http.post(url('/api/v1/me/two-factor/recovery-codes'), async ({ request }) => {
      const refused = guard('recovery-codes', request)
      if (refused) return refused
      if (!state.twoFactorEnabled) return problem(409)
      const { password } = (await request.json()) as { password: string }
      if (password !== state.password) return wrongPassword('password')
      state.recoveryCodes = newRecoveryCodes()
      return HttpResponse.json({ recoveryCodes: state.recoveryCodes })
    }),
    http.post(url('/api/v1/me/password'), async ({ request }) => {
      const refused = guard('password', request)
      if (refused) return refused
      const { currentPassword, newPassword } = (await request.json()) as { currentPassword: string; newPassword: string }
      // The new password is judged first, as in the real API.
      if (newPassword.length < 12) return problem(400, { errors: { newPassword: ['Passwords must be at least 12 characters.'] } })
      if (currentPassword !== state.password) return wrongPassword('currentPassword')
      state.password = newPassword
      return new HttpResponse(null, { status: 204 })
    }),
  )

  return state
}
