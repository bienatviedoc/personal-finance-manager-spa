import { useTranslation } from 'react-i18next'
import { chooseTheme, themeChoices, useThemeChoice } from '@/shared/theme'
import { LabelledSelect } from './LabelledSelect'

export function ThemeSwitch() {
  const { t } = useTranslation()
  const choice = useThemeChoice()

  return (
    <LabelledSelect
      label={t('theme.label')}
      value={choice}
      options={themeChoices.map((option) => ({ value: option, label: t(`theme.${option}`) }))}
      onChoose={chooseTheme}
    />
  )
}
