/**
 * Hands the browser a file to save under a name, as a download: for a file the app fetched itself, which a
 * plain link cannot do when the request needs the client's headers and error handling.
 */
export function saveFile(file: Blob, name: string) {
  const address = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = address
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  // After the click has been acted on: the download starts from the address, which must still stand then.
  setTimeout(() => URL.revokeObjectURL(address), 0)
}

/** The file name a response's `Content-Disposition` header gives, when it gives one. */
export function fileNameOf(response: Response) {
  return /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
}
