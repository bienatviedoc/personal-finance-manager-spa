import { useLocale } from '@/shared/i18n/useLocale'
import { formatShare } from './formatShare'

/** A share of a total as the API works it out, written the locale's way. Nothing when there is none. */
export function Share({ share }: { share: number | string | null }) {
  const locale = useLocale()
  return share === null ? null : <>{formatShare(share, locale)}</>
}
