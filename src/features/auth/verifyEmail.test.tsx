import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi } from '@/test/fakeAuthApi'
import { testPassword } from '@/test/server'

const newUser = { id: '01970000-0000-7000-8000-000000000002', email: 'bao@example.com', password: testPassword, verified: false }

describe('the link in the verification email', () => {
  it('confirms the email address once and invites the user to sign in', async () => {
    const api = fakeAuthApi({ users: [newUser] })
    const { user } = renderApp(`/verify-email?userId=${newUser.id}&token=valid-token`)

    expect(await screen.findByText('Your email address is confirmed. You can sign in now.')).toBeInTheDocument()
    expect(api.verifications).toEqual([{ userId: newUser.id, token: 'valid-token' }])

    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('explains what to do when it is invalid or has expired', async () => {
    fakeAuthApi({ users: [newUser] })
    renderApp(`/verify-email?userId=${newUser.id}&token=expired-token`)

    expect(await screen.findByText('This link is invalid or has expired. Sign in to get a new one.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })
})
