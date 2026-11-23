import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi } from '@/test/fakeAuthApi'
import { testUser } from '@/test/server'

describe('signing out', () => {
  it('is offered in the shell, ends the session, and screens then ask to sign in again', async () => {
    const api = fakeAuthApi({ signedIn: true })
    const { user, router } = renderApp('/reports')

    expect(await screen.findByText(`Signed in as ${testUser.email}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(api.signedInAs).toBeNull()

    await act(() => router.navigate('/reports'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })
})
