import type { Language } from '@/shared/i18n'

/** A share of a total, a percentage to one decimal as the API sends it, written the locale's way: `62.5%`, `62,5%`. */
export function formatShare(share: number | string, locale: Language): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'percent', maximumFractionDigits: 1 }).format(Number(share))
}
