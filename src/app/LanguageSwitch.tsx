import { useTranslation } from 'react-i18next'
import { chooseLanguage, supportedLanguages, type Language } from '@/shared/i18n'
import { LabelledSelect } from './LabelledSelect'

type Props = {
  /** Called after the viewer picks a language, for instance to save it to their profile. */
  onChoose?: (language: Language) => void
}

export function LanguageSwitch({ onChoose }: Props = {}) {
  const { t, i18n } = useTranslation()

  return (
    <LabelledSelect
      label={t('language.label')}
      value={i18n.resolvedLanguage as Language | undefined}
      options={supportedLanguages.map((language: Language) => ({ value: language, label: t(`language.${language}`) }))}
      onChoose={(language) => {
        void chooseLanguage(i18n, language)
        onChoose?.(language)
      }}
    />
  )
}
