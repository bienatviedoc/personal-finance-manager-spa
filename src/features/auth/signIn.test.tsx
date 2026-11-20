import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi } from '@/test/fakeAuthApi'
import { server, signedOut, testPassword, testUser } from '@/test/server'

describe('signed-out visitors', () => {
  it('are sent to sign in when they open a screen', async () => {
    server.use(signedOut())

    const { router } = renderApp('/budgets')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('signing in', () => {
  it('takes the visitor back to the screen they opened', async () => {
    fakeAuthApi()
    const { user } = renderApp('/budgets')

    await user.type(await screen.findByLabelText('Email'), testUser.email)
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
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
})
