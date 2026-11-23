import { act, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDataApi, testExportFileName } from '@/test/fakeDataApi'
import { renderApp } from '@/test/renderApp'
import { apiUrl, problem, server, testPassword } from '@/test/server'

const failedMessage = 'Something went wrong. Try again in a little while.'

describe('the settings for your data', () => {
  it('open from the settings screen', async () => {
    fakeDataApi()
    const { user } = renderApp('/settings')

    await user.click(await screen.findByRole('link', { name: 'Your data' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Your data' })).toBeInTheDocument()
    expect(document.title).toContain('Your data')
  })
})

describe('exporting your data', () => {
  /** What the browser was handed to save: jsdom has no downloads, so the link the app clicks is caught here. */
  const saved: { name: string; file: Blob | undefined }[] = []
  const files = new Map<string, Blob>()

  beforeEach(() => {
    saved.length = 0
    files.clear()
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (file: Blob) => {
        const address = `blob:test/${files.size}`
        files.set(address, file)
        return address
      },
      revokeObjectURL: () => undefined,
    }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, file: files.get(this.href) })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const exportSection = async () => within(await screen.findByRole('region', { name: 'Export your data' }))

  it('asks before downloading, then saves the ZIP file under the name the API gave it', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await exportSection()

    await user.click(section.getByRole('button', { name: 'Export my data' }))

    expect(section.getByText(/The file holds all your financial data/)).toBeInTheDocument()
    expect(api.exports).toBe(0)

    await user.click(section.getByRole('button', { name: 'Download' }))

    expect(await section.findByRole('status')).toHaveTextContent('Your data is downloaded.')
    expect(api.exports).toBe(1)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.name).toBe(testExportFileName)
    expect(await saved[0]?.file?.text()).toBe('PK-test-archive')
    // Done: the question is gone, and the export can be asked for again.
    expect(section.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Export my data' })).toBeInTheDocument()
  })

  it('downloads nothing when the user cancels', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await exportSection()

    await user.click(section.getByRole('button', { name: 'Export my data' }))
    await user.click(section.getByRole('button', { name: 'Cancel' }))

    expect(section.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    expect(api.exports).toBe(0)
    expect(saved).toHaveLength(0)
  })

  it('says in a toast when the export fails, and downloads it when the user tries again', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await exportSection()
    server.use(http.get(apiUrl('/api/v1/export/all.zip'), () => problem(500), { once: true }))

    await user.click(section.getByRole('button', { name: 'Export my data' }))
    await user.click(section.getByRole('button', { name: 'Download' }))

    expect(await screen.findByText(failedMessage)).toBeInTheDocument()
    expect(saved).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(api.exports).toBe(1)
    expect(screen.queryByText(failedMessage)).not.toBeInTheDocument()
  })
})

describe('deleting your profile', () => {
  const deleteSection = async () => within(await screen.findByRole('region', { name: 'Delete your profile' }))

  it('says what will happen, takes the password, signs the user out and tells them how to cancel', async () => {
    const api = fakeDataApi()
    const { user, router } = renderApp('/settings/data')
    const section = await deleteSection()

    expect(section.getByText(/For 30 days you can change your mind/)).toBeInTheDocument()
    await user.click(section.getByRole('button', { name: 'Delete my profile' }))

    expect(api.deletionAttempts).toBe(0)
    await user.type(section.getByLabelText('Password'), testPassword)
    await user.click(section.getByRole('button', { name: 'Delete my profile' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(api.deactivated).toBe(true)
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are signed out, and your profile will be deleted in 30 days. To keep it, sign in again before then.',
    )
    // Nothing of the user lingers: a screen asks them to sign in again.
    await act(() => router.navigate('/accounts'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('says when the password is wrong, and deletes nothing', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await deleteSection()

    await user.click(section.getByRole('button', { name: 'Delete my profile' }))
    await user.type(section.getByLabelText('Password'), 'not my password at all')
    await user.click(section.getByRole('button', { name: 'Delete my profile' }))

    expect(await section.findByText('That is not your password.')).toBeInTheDocument()
    expect(api.deactivated).toBe(false)
    expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeInTheDocument()
  })

  it('asks for the password without contacting the API when it is left empty', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await deleteSection()

    await user.click(section.getByRole('button', { name: 'Delete my profile' }))
    await user.click(section.getByRole('button', { name: 'Delete my profile' }))

    expect(await section.findByText('Enter your password.')).toBeInTheDocument()
    expect(api.deletionAttempts).toBe(0)
  })

  it('deletes nothing when the user cancels', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await deleteSection()

    await user.click(section.getByRole('button', { name: 'Delete my profile' }))
    await user.click(section.getByRole('button', { name: 'Cancel' }))

    expect(section.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(api.deletionAttempts).toBe(0)
  })

  it('says in a toast when deleting fails, and deletes when the user tries again', async () => {
    const api = fakeDataApi()
    const { user } = renderApp('/settings/data')
    const section = await deleteSection()
    server.use(http.post(apiUrl('/api/v1/me/deletion'), () => problem(500), { once: true }))

    await user.click(section.getByRole('button', { name: 'Delete my profile' }))
    await user.type(section.getByLabelText('Password'), testPassword)
    await user.click(section.getByRole('button', { name: 'Delete my profile' }))

    expect(await screen.findByText(failedMessage)).toBeInTheDocument()
    expect(api.deactivated).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(api.deactivated).toBe(true)
  })

  it.each(['en', 'vi'] as const)('speaks of the profile or the user, never of an account (%s)', async (language) => {
    fakeDataApi()
    const { user, i18n } = renderApp('/settings/data', { language })
    const t = i18n.getFixedT(language)
    const section = within(await screen.findByRole('region', { name: t('settings.data.delete.title') }))
    await user.click(section.getByRole('button', { name: t('settings.data.delete.start') }))

    const accountInThisLanguage = language === 'en' ? /account/i : /tài khoản/i
    expect(section.getByRole('button', { name: t('settings.data.delete.submit') })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: t('settings.data.delete.title') }).textContent).not.toMatch(accountInThisLanguage)
    expect(t('auth.deletion.requested')).not.toMatch(accountInThisLanguage)
    expect(t('auth.deletion.cancelled')).not.toMatch(accountInThisLanguage)
  })
})
