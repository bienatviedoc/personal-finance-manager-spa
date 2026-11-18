/** Where to go after signing in: the screen the visitor opened, if it is a path in this app. */
export function returnToFrom(search: URLSearchParams): string {
  const returnTo = search.get('returnTo') ?? ''
  const isLocalPath = returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.startsWith('/\\')
  return isLocalPath ? returnTo : '/'
}
