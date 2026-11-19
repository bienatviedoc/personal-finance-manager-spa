import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, focusRing } from '@/shared/lib/utils'
import { chooseLanguage, supportedLanguages, type Language } from '@/shared/i18n'

type Props = {
  /** Called after the viewer picks a language, for instance to save it to their profile. */
  onChoose?: (language: Language) => void
}

export function LanguageSwitch({ onChoose }: Props = {}) {
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
        onChange={(event) => {
          const language = event.target.value as Language
          void chooseLanguage(i18n, language)
          onChoose?.(language)
        }}
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
