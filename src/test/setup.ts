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
