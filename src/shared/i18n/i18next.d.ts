import 'i18next'
import type en from './locales/en.json'

// English is the source language: every translation key must exist in it, so a typo in a
// key passed to t() fails type checking.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
