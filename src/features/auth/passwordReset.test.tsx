import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi } from '@/test/fakeAuthApi'
import { testPassword, testUser } from '@/test/server'

const newPassword = 'a brand new passphrase'

describe('asking for a password reset', () => {
  it('is reached from signing in and shows the same confirmation for any email', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp('/login')

    await user.click(await screen.findByRole('link', { name: 'Forgot your password?' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(
      await screen.findByText('If nobody@example.com has a user, we sent a link to it. Open it to set a new password.'),
    ).toBeInTheDocument()
    expect(api.resetRequestedFor).toEqual(['nobody@example.com'])
  })

  it('points out an invalid email before contacting the API', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp('/forgot-password')

    await user.type(await screen.findByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(api.resetRequestedFor).toEqual([])
  })
})

describe('the link in the password reset email', () => {
  const link = `/reset-password?userId=${testUser.id}&token=valid-reset-token`

  it('sets a new password the user can then sign in with', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp(link)

    await user.type(await screen.findByLabelText('New password'), newPassword)
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('Your password is changed. Sign in with your new password.')).toBeInTheDocument()
    expect(api.users[0]?.password).toBe(newPassword)

    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('points out a password that is too short before contacting the API', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp(link)

    await user.type(await screen.findByLabelText('New password'), 'too short')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    expect(api.users[0]?.password).toBe(testPassword)
  })

  it('explains that a used or expired link no longer works and offers a new one', async () => {
    const api = fakeAuthApi()
    api.usedResetTokens.push('valid-reset-token')
    const { user } = renderApp(link)

    await user.type(await screen.findByLabelText('New password'), newPassword)
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('This link is invalid, has been used or has expired. Ask for a new one.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Ask for a new link' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Forgot your password?' })).toBeInTheDocument()
  })

  it('explains that a link missing its parts does not work, without a form', async () => {
    fakeAuthApi()
    renderApp('/reset-password?userId=only-half')

    expect(await screen.findByText('This link is invalid, has been used or has expired. Ask for a new one.')).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
})
