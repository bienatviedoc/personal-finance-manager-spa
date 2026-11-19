import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'
import { fakeAuthApi, testPassword } from '@/test/server'

describe('registering', () => {
  it('asks the new user to check their email, and can send the link again', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp('/register')

    await user.type(await screen.findByLabelText('Email'), 'bao@example.com')
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText('We sent a link to bao@example.com. Open it to confirm your email address.')).toBeInTheDocument()
    expect(api.registered).toEqual(['bao@example.com'])

    await user.click(screen.getByRole('button', { name: 'Send the link again' }))
    expect(await screen.findByText('We sent a new link to bao@example.com.')).toBeInTheDocument()
    expect(api.resentTo).toEqual(['bao@example.com'])
  })

  it('points out a password that is too short before contacting the API', async () => {
    const api = fakeAuthApi()
    const { user } = renderApp('/register')

    await user.type(await screen.findByLabelText('Email'), 'bao@example.com')
    await user.type(screen.getByLabelText('Password'), 'too short')
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 12 characters. Use at least 12 characters.')
    expect(api.registered).toEqual([])
  })

  it('shows a problem only the API could find next to the field it concerns', async () => {
    fakeAuthApi()
    const { user } = renderApp('/register')

    await user.type(await screen.findByLabelText('Email'), 'bao@example.invalid')
    await user.type(screen.getByLabelText('Password'), testPassword)
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('heading', { level: 1, name: 'Check your email' })).not.toBeInTheDocument()
  })
})
