import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi } from '@/test/fakeAuthApi'
import { server, signedOut, testPassword, testUser } from '@/test/server'

describe('signed-out visitors', () => {
  it('are sent to sign in when they open a screen', async () => {
    server.use(signedOut())

    const { router } = renderApp('/reports')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('takes the visitor back to the screen they opened', async () => {
    fakeAuthApi()
    const { user } = renderApp('/reports')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
  })

  it('points out a missing or malformed field without contacting the API', async () => {
    const api = fakeAuthApi()
    const loginRequests: Request[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/login')) loginRequests.push(request)
    })
    const { user } = renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
    expect(loginRequests).toHaveLength(0)
    expect(api.signedInAs).toBeNull()
    server.events.removeAllListeners()
  })

  it('says when the email or password is wrong', async () => {
    fakeAuthApi()
    const { user } = renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
  })

  it('offers to resend the link when the email address is not confirmed yet', async () => {
    const api = fakeAuthApi({ users: [{ ...testUser, password: testPassword, verified: false }] })
    const { user } = renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await user.click(await screen.findByRole('button', { name: 'Send the link again' }))

    expect(await screen.findByText(`We sent a new link to ${testUser.email}.`)).toBeInTheDocument()
    expect(api.resentTo).toEqual([testUser.email])
    expect(api.signedInAs).toBeNull()
  })

  it('never sends the visitor to another site afterwards', async () => {
    fakeAuthApi()
    const { user, router } = renderApp('/login?returnTo=//evil.example/steal')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('says when the client has made too many attempts', async () => {
    const api = fakeAuthApi()
    api.overRateLimit = true
    const { user } = renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Wait a minute, then try again.')
  })

  it('warns that several wrong attempts pause signing in', async () => {
    fakeAuthApi()
    const { user } = renderApp('/login')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), 'not the password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('After 5 wrong attempts in a row, signing in is paused for 15 minutes.')
  })
})

describe('signing in as a user who asked to be deleted', () => {
  const deactivated = () => fakeAuthApi({ users: [{ ...testUser, password: testPassword, verified: true, deactivated: true }] })

  it('cancels the deletion and says so on the screen they land on, until they dismiss it', async () => {
    const api = deactivated()
    const { user } = renderApp('/budgets')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(api.users[0]?.deactivated).toBe(false)
    expect(screen.getByRole('status')).toHaveTextContent('Welcome back. Signing in cancelled the deletion of your profile, and nothing was erased.')

    await user.click(screen.getByRole('button', { name: 'OK' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says nothing of the kind to a user who never asked', async () => {
    fakeAuthApi()
    const { user } = renderApp('/budgets')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(screen.queryByText(/cancelled the deletion/)).not.toBeInTheDocument()
  })
})

describe('signing in with two factors', () => {
  const twoFactor = () => ({ code: '123456', recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] })
  const withTwoFactor = () => fakeAuthApi({ users: [{ ...testUser, password: testPassword, verified: true, twoFactor: twoFactor() }] })

  async function enterEmailAndPassword(user: ReturnType<typeof renderApp>['user']) {
    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
  }

  it('asks for the code from the authenticator app after the password, then signs in', async () => {
    const api = withTwoFactor()
    const { user } = renderApp('/reports')
    await enterEmailAndPassword(user)

    const code = await screen.findByLabelText('Code from your authenticator app')
    expect(code).toHaveFocus()
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(api.signedInAs).toBeNull()
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
  })

  it('says when the code is wrong and lets the visitor try another', async () => {
    const api = withTwoFactor()
    const { user } = renderApp('/login')
    await enterEmailAndPassword(user)

    const code = await screen.findByLabelText('Code from your authenticator app')
    await user.type(code, '000000')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.')
    expect(api.signedInAs).toBeNull()
    await user.clear(code)
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('asks for a code before contacting the API again', async () => {
    withTwoFactor()
    const { user } = renderApp('/login')
    await enterEmailAndPassword(user)

    await screen.findByLabelText('Code from your authenticator app')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter the 6-digit code.')).toBeInTheDocument()
  })

  it('takes a recovery code in place of the authenticator, which then cannot be used again', async () => {
    const api = withTwoFactor()
    const { user } = renderApp('/login')
    await enterEmailAndPassword(user)

    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }))
    await user.type(screen.getByLabelText('Recovery code'), 'AAAAA-BBBBB')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(api.users[0]?.twoFactor?.recoveryCodes).toEqual(['CCCCC-DDDDD'])
  })

  it('lets the visitor go back from a recovery code to the authenticator, or start over', async () => {
    withTwoFactor()
    const { user } = renderApp('/login')
    await enterEmailAndPassword(user)

    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }))
    await user.click(screen.getByRole('button', { name: 'Use your authenticator app instead' }))
    expect(screen.getByLabelText('Code from your authenticator app')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign in as someone else' }))
    expect(await screen.findByLabelText('Email')).toHaveValue('')
  })
})
