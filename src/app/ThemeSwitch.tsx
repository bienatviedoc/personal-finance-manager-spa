import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn, focusRing } from '@/shared/lib/utils'
import { chooseTheme, themeChoices, useThemeChoice, type ThemeChoice } from '@/shared/theme'

export function ThemeSwitch() {
  const { t } = useTranslation()
  const id = useId()
  const choice = useThemeChoice()

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        {t('theme.label')}
      </label>
      <select
        id={id}
        className={cn('rounded-md border border-input bg-background px-2 py-1', focusRing)}
        value={choice}
        onChange={(event) => chooseTheme(event.target.value as ThemeChoice)}
      >
        {themeChoices.map((option) => (
          <option key={option} value={option}>
            {t(`theme.${option}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
