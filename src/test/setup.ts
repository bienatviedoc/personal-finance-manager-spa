import { File as NodeFile } from 'node:buffer'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { loadAccountBalance, loadReportsScreen } from '@/features/reports'
import { forgetAntiforgeryToken } from '@/shared/api/client'
import { installFakeMatchMedia } from './mediaQueries'
import { server } from './server'

// jsdom has no pointer capture, which the toast primitive asks about when it is clicked.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined

// jsdom has no scrolling, and says so each time the virtualised transaction list puts the page where it has it.
window.scrollTo = () => undefined

// An upload leaves a test through Node's fetch and is read back by Node's form parser; neither can read a form
// or a file made by jsdom, so the upload would arrive broken. Forms and files are Node's own here: the form as
// its Response hands one out, the File from node:buffer.
globalThis.FormData = (await new Response(new URLSearchParams()).formData()).constructor as typeof FormData
globalThis.File = NodeFile

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

// The reports screen is loaded when first opened, with the charting library, and many tests open it as just any
// screen. Loading it can take longer than a test waits for what it shows, so it is loaded once here, before them.
beforeAll(() => Promise.all([loadReportsScreen(), loadAccountBalance()]), 30_000)

beforeEach(() => {
  installFakeMatchMedia()
  // jsdom lays nothing out, so a virtualised list cannot tell which rows are on screen. The pretend screen is
  // tall enough for every row a test lists; a test of virtualisation itself makes it a real height.
  window.innerHeight = 100_000
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  localStorage.clear()
  server.resetHandlers()
  forgetAntiforgeryToken()
})

afterAll(() => {
  server.close()
})
