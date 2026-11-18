import { useTranslation } from 'react-i18next'

/** Stands in for a screen until the slice that builds it lands. */
export function PlaceholderPage({ title }: { title: string }) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{t('placeholder.notBuilt')}</p>
    </section>
  )
}
