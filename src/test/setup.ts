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

// jsdom has no scrolling, and says so each time the virtualised transaction list puts the page where it has it.
window.scrollTo = () => undefined

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

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
