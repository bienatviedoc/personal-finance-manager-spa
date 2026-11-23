// The one thing the tests take from Node itself (see setup.ts). The app is typed for the browser, so Node's
// own types are not loaded here.
declare module 'node:buffer' {
  export const File: typeof globalThis.File
}
