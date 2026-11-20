/**
 * jsdom has no `matchMedia`. This stands in for it with a pretend device whose screen width and
 * colour-scheme preference a test can set, and which tells listeners when either changes, as a
 * browser does when a phone rotates or the system theme flips.
 *
 * Every test starts on a light-themed desktop (see setup.ts).
 */

import { act } from '@testing-library/react'

type Device = { width: number; prefersDark: boolean }

const device: Device = { width: 1280, prefersDark: false }
const queries = new Set<FakeMediaQueryList>()

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null
  readonly media: string
  private last: boolean

  constructor(media: string) {
    super()
    this.media = media
    this.last = this.matches
  }

  get matches() {
    return evaluate(this.media)
  }

  /** Tells listeners when the device change flipped this query, as a browser does. */
  notify() {
    if (this.matches === this.last) return
    this.last = this.matches
    const event = Object.assign(new Event('change'), { matches: this.matches, media: this.media }) as MediaQueryListEvent
    this.dispatchEvent(event)
    this.onchange?.call(this, event)
  }

  addListener(listener: (event: MediaQueryListEvent) => void) {
    this.addEventListener('change', listener as EventListener)
  }

  removeListener(listener: (event: MediaQueryListEvent) => void) {
    this.removeEventListener('change', listener as EventListener)
  }
}

function evaluate(media: string): boolean {
  const colorScheme = /prefers-color-scheme:\s*(dark|light)/.exec(media)
  if (colorScheme) return (colorScheme[1] === 'dark') === device.prefersDark
  const minWidth = /min-width:\s*(\d+)px/.exec(media)
  if (minWidth) return device.width >= Number(minWidth[1])
  throw new Error(`The fake matchMedia does not understand "${media}".`)
}

function changeDevice(update: Partial<Device>) {
  Object.assign(device, update)
  // Wrapped in act so React finishes re-rendering before the test looks.
  act(() => {
    for (const query of queries) query.notify()
  })
}

/** Installs the fake on `window`, back on a light-themed desktop. */
export function installFakeMatchMedia() {
  queries.clear()
  Object.assign(device, { width: 1280, prefersDark: false })
  window.matchMedia = (media: string) => {
    const query = new FakeMediaQueryList(media)
    queries.add(query)
    return query
  }
}

/** Sets the colour scheme the device's system prefers. */
export function setSystemTheme(theme: 'light' | 'dark') {
  changeDevice({ prefersDark: theme === 'dark' })
}

/** Sets the device's screen width in CSS pixels; a phone is 360. */
export function setScreenWidth(width: number) {
  changeDevice({ width })
}
