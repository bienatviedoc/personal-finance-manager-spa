import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { forgetAntiforgeryToken } from '@/shared/api/client'
import { server } from './server'

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  server.resetHandlers()
  forgetAntiforgeryToken()
})

afterAll(() => {
  server.close()
})
