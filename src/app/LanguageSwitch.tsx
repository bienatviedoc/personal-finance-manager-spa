import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { supportedLanguages, type Language } from '@/shared/i18n'

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const id = useId()

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {t('language.label')}
      </label>
      <select
        id={id}
        className="rounded-md border border-input bg-background px-2 py-1"
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {supportedLanguages.map((language: Language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
