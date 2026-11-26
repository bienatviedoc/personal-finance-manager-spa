import { vi } from 'vitest'

/** A file the app handed the browser to save. */
export type SavedFile = { name: string; file: Blob | undefined }

/**
 * Catches what the app hands the browser to save (`saveFile`): jsdom has no downloads, so the link the app clicks
 * is caught here, with the file its address stands for. Undo it with `vi.restoreAllMocks()` and
 * `vi.unstubAllGlobals()`.
 */
export function catchDownloads() {
  const saved: SavedFile[] = []
  const files = new Map<string, Blob>()
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: (file: Blob) => {
        const address = `blob:test/${files.size}`
        files.set(address, file)
        return address
      },
      revokeObjectURL: () => undefined,
    }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, file: files.get(this.href) })
  })
  return saved
}

/** The text of a saved file, and whether it starts with the byte order mark that tells a spreadsheet it is UTF-8. */
export async function textOf(file: Blob | undefined) {
  const bytes = new Uint8Array(await file!.arrayBuffer())
  const hasByteOrderMark = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  return { hasByteOrderMark, text: new TextDecoder('utf-8', { ignoreBOM: false }).decode(bytes) }
}
