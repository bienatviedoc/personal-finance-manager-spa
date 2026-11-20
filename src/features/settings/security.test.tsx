import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fakeSecurityApi, testAuthenticatorCode, testAuthenticatorKey } from '@/test/fakeSecurityApi'
import { renderApp } from '@/test/renderApp'
import { testPassword } from '@/test/server'

const newPassword = 'a brand new passphrase'

describe('security settings', () => {
  it('open from the settings screen', async () => {
    fakeSecurityApi()
    const { user } = renderApp('/settings')

    await user.click(await screen.findByRole('link', { name: 'Security' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Security' })).toBeInTheDocument()
    expect(document.title).toContain('Security')
  })
})

describe('changing the password', () => {
  const passwordForm = async () => within(await screen.findByRole('form', { name: 'Password' }))

  it('takes the current password and a new one, and says when it is changed', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const form = await passwordForm()

    await user.type(form.getByLabelText('Current password'), testPassword)
    await user.type(form.getByLabelText('New password'), newPassword)
    await user.click(form.getByRole('button', { name: 'Change password' }))

    expect(await form.findByRole('status')).toHaveTextContent('Your password is changed. You are signed out everywhere else.')
    expect(api.password).toBe(newPassword)
    expect(form.getByLabelText('Current password')).toHaveValue('')
    expect(form.getByLabelText('New password')).toHaveValue('')
  })

  it('points out a missing current password or a short new one without contacting the API', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const form = await passwordForm()

    await user.type(form.getByLabelText('New password'), 'too short')
    await user.click(form.getByRole('button', { name: 'Change password' }))

    expect(await form.findByText('Enter your current password.')).toBeInTheDocument()
    expect(form.getByLabelText('New password')).toHaveAccessibleDescription(/Use at least 12 characters\./)
    expect(api.calls.password).toBeUndefined()
  })

  it('says when the current password is wrong, and changes nothing', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const form = await passwordForm()

    await user.type(form.getByLabelText('Current password'), 'not my password at all')
    await user.type(form.getByLabelText('New password'), newPassword)
    await user.click(form.getByRole('button', { name: 'Change password' }))

    expect(await form.findByText('That is not your current password.')).toBeInTheDocument()
    expect(form.queryByRole('status')).not.toBeInTheDocument()
    expect(api.password).toBe(testPassword)
  })
})

describe('two-factor sign-in', () => {
  const twoFactor = async () => within(await screen.findByRole('region', { name: 'Two-factor sign-in' }))

  async function startSetUp(user: ReturnType<typeof renderApp>['user']) {
    const section = await twoFactor()
    await user.click(await section.findByRole('button', { name: 'Set up two-factor sign-in' }))
    return section
  }

  it('is off for a user who has not set it up', async () => {
    fakeSecurityApi()
    renderApp('/settings/security')
    const section = await twoFactor()

    expect(await section.findByText('Two-factor sign-in is off.')).toBeInTheDocument()
  })

  it('shows a QR code for the authenticator app, and the key for typing it in by hand', async () => {
    fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)

    expect(await section.findByRole('img', { name: 'QR code to scan with your authenticator app' })).toBeInTheDocument()
    // In groups of four, the way authenticator apps show keys.
    expect(section.getByTestId('authenticator-key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    expect(testAuthenticatorKey).toBe('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')
  })

  it('turns on once a code from the authenticator confirms it, and shows the recovery codes once', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)

    await user.type(await section.findByLabelText('Code from your authenticator app'), '123 456')
    await user.click(section.getByRole('button', { name: 'Turn on' }))

    const codes = within(await section.findByRole('list', { name: 'Recovery codes' })).getAllByRole('listitem')
    expect(codes.map((code) => code.textContent)).toEqual(api.recoveryCodes)
    expect(codes).toHaveLength(10)
    expect(api.twoFactorEnabled).toBe(true)
    expect(section.getByText('Two-factor sign-in is on.')).toBeInTheDocument()

    await user.click(section.getByRole('button', { name: 'I have saved them' }))
    expect(section.queryByRole('list', { name: 'Recovery codes' })).not.toBeInTheDocument()
    expect(section.getByText('10 recovery codes left.')).toBeInTheDocument()
  })

  it('copies the recovery codes for pasting somewhere safe', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)
    await user.type(await section.findByLabelText('Code from your authenticator app'), testAuthenticatorCode)
    await user.click(section.getByRole('button', { name: 'Turn on' }))

    await user.click(await section.findByRole('button', { name: 'Copy codes' }))

    expect(await navigator.clipboard.readText()).toBe(api.recoveryCodes.join('\n'))
    expect(await section.findByText('Copied.')).toBeInTheDocument()
  })

  it('stays off when the code is wrong, and says so', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)

    await user.type(await section.findByLabelText('Code from your authenticator app'), '000000')
    await user.click(section.getByRole('button', { name: 'Turn on' }))

    expect(await section.findByText('That code is not right. Enter the newest code from your authenticator app.')).toBeInTheDocument()
    expect(api.twoFactorEnabled).toBe(false)
  })

  it('asks for six digits before contacting the API', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)

    await user.type(await section.findByLabelText('Code from your authenticator app'), '12345')
    await user.click(section.getByRole('button', { name: 'Turn on' }))

    expect(await section.findByText('Enter the 6-digit code.')).toBeInTheDocument()
    expect(api.calls.enable).toBeUndefined()
  })

  it('can be backed out of before it is turned on', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await startSetUp(user)

    await user.click(await section.findByRole('button', { name: 'Cancel' }))

    expect(section.getByRole('button', { name: 'Set up two-factor sign-in' })).toBeInTheDocument()
    expect(api.twoFactorEnabled).toBe(false)
  })

  it('says it is on and how many recovery codes are left', async () => {
    fakeSecurityApi({ twoFactor: true })
    renderApp('/settings/security')
    const section = await twoFactor()

    expect(await section.findByText('Two-factor sign-in is on.')).toBeInTheDocument()
    expect(section.getByText('10 recovery codes left.')).toBeInTheDocument()
    expect(section.queryByRole('button', { name: 'Set up two-factor sign-in' })).not.toBeInTheDocument()
  })

  it('turns off for the password, and not for a wrong one', async () => {
    const api = fakeSecurityApi({ twoFactor: true })
    const { user } = renderApp('/settings/security')
    const section = await twoFactor()

    await user.click(await section.findByRole('button', { name: 'Turn off two-factor sign-in' }))
    await user.type(section.getByLabelText('Password'), 'not my password at all')
    await user.click(section.getByRole('button', { name: 'Turn off' }))
    expect(await section.findByText('That is not your password.')).toBeInTheDocument()
    expect(api.twoFactorEnabled).toBe(true)

    await user.clear(section.getByLabelText('Password'))
    await user.type(section.getByLabelText('Password'), testPassword)
    await user.click(section.getByRole('button', { name: 'Turn off' }))

    expect(await section.findByText('Two-factor sign-in is off.')).toBeInTheDocument()
    expect(api.twoFactorEnabled).toBe(false)
  })

  it('makes new recovery codes for the password, replacing the old ones', async () => {
    const api = fakeSecurityApi({ twoFactor: true })
    const old = [...api.recoveryCodes]
    const { user } = renderApp('/settings/security')
    const section = await twoFactor()

    await user.click(await section.findByRole('button', { name: 'Get new recovery codes' }))
    await user.type(section.getByLabelText('Password'), testPassword)
    await user.click(section.getByRole('button', { name: 'Get new codes' }))

    const codes = within(await section.findByRole('list', { name: 'Recovery codes' })).getAllByRole('listitem')
    expect(codes.map((code) => code.textContent)).toEqual(api.recoveryCodes)
    expect(api.recoveryCodes).not.toEqual(old)
  })

  it('shows that it is already on when it was turned on somewhere else before setting it up here', async () => {
    const api = fakeSecurityApi()
    const { user } = renderApp('/settings/security')
    const section = await twoFactor()
    const setUp = await section.findByRole('button', { name: 'Set up two-factor sign-in' })
    api.twoFactorEnabled = true

    await user.click(setUp)

    expect(await section.findByText('Two-factor sign-in is on.')).toBeInTheDocument()
    expect(section.queryByRole('alert')).not.toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Turn off two-factor sign-in' })).toBeInTheDocument()
  })

  it('shows that it is off when it was turned off somewhere else before getting new recovery codes here', async () => {
    const api = fakeSecurityApi({ twoFactor: true })
    const { user } = renderApp('/settings/security')
    const section = await twoFactor()
    await user.click(await section.findByRole('button', { name: 'Get new recovery codes' }))
    api.twoFactorEnabled = false
    api.recoveryCodes = []

    await user.type(section.getByLabelText('Password'), testPassword)
    await user.click(section.getByRole('button', { name: 'Get new codes' }))

    expect(await section.findByText('Two-factor sign-in is off.')).toBeInTheDocument()
    expect(section.queryByRole('alert')).not.toBeInTheDocument()
    expect(section.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Set up two-factor sign-in' })).toBeInTheDocument()
  })
})
