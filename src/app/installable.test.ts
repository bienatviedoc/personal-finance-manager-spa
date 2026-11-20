import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'

// Everything in public/ that a browser installing the app would read: the manifest and the icons,
// each icon as a data URL so its pixel size can be read.
const manifests = import.meta.glob<string>('/public/*.webmanifest', { query: '?raw', import: 'default', eager: true })
const images = import.meta.glob<string>('/public/**/*.png', { query: '?inline', import: 'default', eager: true })

type Icon = { src: string; sizes: string; type: string; purpose?: string }
type Manifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: Icon[]
}

/** The path under public/ that a `<link rel>` in index.html points at. */
function linked(rel: string) {
  const href = new RegExp(`<link rel="${rel}" href="(/[^"]+)"`).exec(indexHtml)?.[1]
  if (!href) throw new Error(`index.html has no <link rel="${rel}">.`)
  return `/public${href}`
}

function readManifest(): Manifest {
  const text = manifests[linked('manifest')]
  if (!text) throw new Error(`${linked('manifest')} does not exist.`)
  return JSON.parse(text) as Manifest
}

/** A PNG's width and height, from the IHDR chunk that follows its 8-byte signature; undefined when there is no such file. */
function pngSize(file: string) {
  const dataUrl = images[file]
  if (!dataUrl) return undefined
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (char) => char.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  return `${view.getUint32(16)}x${view.getUint32(20)}`
}

describe('installing the app to the home screen', () => {
  it('links a web app manifest that opens the app standalone at its root', () => {
    const manifest = readManifest()

    expect(manifest).toMatchObject({
      name: 'Personal Finance Manager',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
      background_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    })
    // Longer names are cut off under the home-screen icon.
    expect(manifest.short_name.length).toBeGreaterThan(0)
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('has 192 and 512 px icons, and a maskable one, each the size it claims', () => {
    const { icons } = readManifest()
    const purposes = (icon: Icon) => (icon.purpose ?? 'any').split(' ')

    for (const icon of icons) {
      expect(icon.type).toBe('image/png')
      expect(pngSize(`/public${icon.src}`), icon.src).toBe(icon.sizes)
    }
    const anyPurposeSizes = icons.filter((icon) => purposes(icon).includes('any')).map((icon) => icon.sizes)
    expect(anyPurposeSizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(icons.some((icon) => purposes(icon).includes('maskable'))).toBe(true)
  })

  it('gives iOS a home-screen icon and the browser a theme colour for each system theme', () => {
    expect(pngSize(linked('apple-touch-icon'))).toBe('180x180')
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)"/)
    expect(indexHtml).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)"/)
  })
})
