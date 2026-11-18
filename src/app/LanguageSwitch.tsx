import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, focusRing } from '@/shared/lib/utils'
import { chooseLanguage, supportedLanguages, type Language } from '@/shared/i18n'

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
        className={cn('rounded-md border border-input bg-background px-2 py-1', focusRing)}
        value={i18n.resolvedLanguage}
        onChange={(event) => void chooseLanguage(i18n, event.target.value as Language)}
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
