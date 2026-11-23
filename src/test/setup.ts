import { File as NodeFile } from 'node:buffer'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { forgetAntiforgeryToken } from '@/shared/api/client'
import { installFakeMatchMedia } from './mediaQueries'
import { server } from './server'

// jsdom has no pointer capture, which the toast primitive asks about when it is clicked.
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined

// An upload leaves a test through Node's fetch and is read back by Node's form parser; neither can read a form
// or a file made by jsdom, so the upload would arrive broken. Forms and files are Node's own here: the form as
// its Response hands one out, the File from node:buffer.
globalThis.FormData = (await new Response(new URLSearchParams()).formData()).constructor as typeof FormData
globalThis.File = NodeFile

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

beforeEach(() => {
  installFakeMatchMedia()
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
