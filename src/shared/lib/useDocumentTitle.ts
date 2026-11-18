import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Names the current screen in the browser tab, ahead of the app's name. */
export function useDocumentTitle(screenTitle: string) {
  const { t } = useTranslation()
  const appName = t('app.name')

  useEffect(() => {
    document.title = `${screenTitle} · ${appName}`
  }, [screenTitle, appName])
}
