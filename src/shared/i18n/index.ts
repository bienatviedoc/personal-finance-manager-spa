import i18next, { type i18n } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import vi from './locales/vi.json'

export const resources = { en: { translation: en }, vi: { translation: vi } } as const

export const supportedLanguages = ['en', 'vi'] as const
export type Language = (typeof supportedLanguages)[number]

const storageKey = 'pfm.language'

/**
 * Creates an initialised i18next instance. Without a language, it uses the one the viewer
 * chose last time, then the browser's, falling back to English.
 */
export function createI18n({ language }: { language?: Language } = {}): i18n {
  const instance = i18next.createInstance()
  if (!language) instance.use(LanguageDetector)
  instance.use(initReactI18next)

  void instance.init({
    resources,
    lng: language,
    fallbackLng: 'en',
    supportedLngs: supportedLanguages,
    load: 'languageOnly',
    initAsync: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: storageKey,
      // Detection never writes: only an explicit choice is remembered (see chooseLanguage).
      caches: [],
    },
  })

  const setDocumentLanguage = (lng: string) => {
    document.documentElement.lang = lng
  }
  setDocumentLanguage(instance.resolvedLanguage ?? 'en')
  instance.on('languageChanged', setDocumentLanguage)

  return instance
}

/** Switches to a language the viewer picked and remembers it in their browser. */
export async function chooseLanguage(instance: i18n, language: Language): Promise<void> {
  await instance.changeLanguage(language)
  try {
    localStorage.setItem(storageKey, language)
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the choice then lasts for this visit.
  }
}
