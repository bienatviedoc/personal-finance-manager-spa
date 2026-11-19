import { useTranslation } from 'react-i18next'
import { isLanguage, type Language } from '.'

/**
 * The locale the interface is shown in, which also decides how amounts, numbers and dates are written.
 * It follows the user's profile once they have chosen a locale, and their browser until then.
 */
export function useLocale(): Language {
  const { i18n } = useTranslation()
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en'
}
